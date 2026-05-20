/**
 * reconciliation.engine.ts
 * ─────────────────────────
 * Motor canónico único de conciliación.
 * Instanciable desde NestJS (ConciliacionService) y desde scripts CLI.
 *
 * Cascada de estrategias (en orden de prioridad):
 *   Pass 0 – RUT-First 1:1   (metadata.providerRut → proveedor en BD → monto+fecha)
 *   Pass 0b– RUT-First 1:N   (mismo RUT, varios DTEs suman ≈ TX)
 *   Pass 1 – Monto exacto    (monto idéntico → fecha más cercana ≤ 90d)
 *   Pass 2 – RUT+Monto       (RUT en descripción + monto ±5% ≤ 90d)
 *   Pass 3 – Alias+Monto     (ProviderAlias / AutoCategoryRule + monto ±5%)
 *   Pass 4 – FuzzyName       (palabra del nombre en descripción + monto ±3% ≤ 60d)
 *   Pass 5 – SUM N:1         (2 TXs suman ≈ 1 DTE, tolerancia 1%)
 *   Pass 6 – SPLIT 1:N       (1 TX paga 2 DTEs del mismo proveedor)
 */

import { PrismaClient, MatchStatus, TransactionStatus } from '@prisma/client';

// ─── Tipos internos ───────────────────────────────────────────────────────────

export interface EngineOptions {
    organizationId: string;
    dryRun?: boolean;
    lookbackDays?: number;       // default 180
    amountTolerance?: number;    // CLP, default 1000
    dateWindowDays?: number;     // default 90
}

export interface EngineResult {
    processed: number;
    pass0Rut: number;
    pass1Exact: number;
    pass2RutAmount: number;
    pass3Alias: number;
    pass4Fuzzy: number;
    pass5Sum: number;
    pass6Split: number;
    totalDrafts: number;
    totalSuggestions: number;
    stillPending: number;
}

interface TxRow {
    id: string;
    date: Date;
    amount: number;
    description: string | null;
    metadata: any;
    bankAccount: { bankName: string; accountNumber: string; organizationId: string };
}

interface DteRow {
    id: string;
    folio: number;
    type: number;
    totalAmount: number;
    issuedDate: Date;
    rutIssuer: string;
    providerId: string | null;
    provider: { id: string; name: string; rut: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(str: string): string {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
}

function extractRutFromDesc(desc: string): string | null {
    if (!desc) return null;
    // 1. Formato con puntos y/o guión en cualquier parte (ej: 76.123.456-7, 76123456-7, 12.345.678-K, 12345678-0)
    const m1 = desc.match(/(\d{1,2}(?:\.?\d{3}){2}-?[\dkK])\b/i);
    if (m1) {
        const clean = m1[1].replace(/\./g, '').replace(/-/g, '').toUpperCase();
        return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
    }

    // 2. Formato con cero líder o números de 8-9 dígitos continuos sin guión (ej: 0761234560, 167511600)
    const m2 = desc.match(/\b0?(\d{7,8})(\d)\b/);
    if (m2) {
        return `${m2[1]}-${m2[2]}`;
    }

    return null;
}

function dateDiffDays(a: Date, b: Date): number {
    return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

function confidenceByDate(days: number): number {
    if (days <= 3)  return 0.97;
    if (days <= 7)  return 0.95;
    if (days <= 14) return 0.90;
    if (days <= 30) return 0.85;
    if (days <= 60) return 0.75;
    return 0.65;
}

function findSubsetSum(amounts: number[], target: number, tolerance: number, maxLen: number): number[] | null {
    const search = (start: number, chosen: number[], current: number): number[] | null => {
        if (chosen.length >= 2 && Math.abs(current - target) <= tolerance) return [...chosen];
        if (chosen.length >= maxLen || current > target + tolerance) return null;
        for (let i = start; i < amounts.length; i++) {
            chosen.push(i);
            const result = search(i + 1, chosen, current + amounts[i]);
            if (result) return result;
            chosen.pop();
        }
        return null;
    };
    return search(0, [], 0);
}

// ─── Motor ────────────────────────────────────────────────────────────────────

export class ReconciliationEngine {
    constructor(private readonly prisma: PrismaClient) {}

    async run(opts: EngineOptions): Promise<EngineResult> {
        const {
            organizationId,
            dryRun = false,
            amountTolerance = 1000,
            dateWindowDays = 90,
        } = opts;

        // Siempre desde el 1 de enero 2026 — KPIs y conciliacion son anuales
        const lookbackDate = new Date('2026-01-01T00:00:00.000Z');

        // ── 1. Cargar datos ──────────────────────────────────────────────────
        const [pendingTxs, unpaidDtes, allProviders, providerAliases, autoCatRules] = await Promise.all([
            this.prisma.bankTransaction.findMany({
                where: {
                    status: { in: [
                        TransactionStatus.PENDING,
                        TransactionStatus.PARTIALLY_MATCHED,
                    ] },
                    type: 'DEBIT',
                    date: { gte: lookbackDate },
                    bankAccount: { organizationId },
                },
                include: { bankAccount: { select: { bankName: true, accountNumber: true, organizationId: true } } },
                orderBy: { date: 'asc' },
            }),

            this.prisma.dTE.findMany({
                where: {
                    paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
                    organizationId,
                    type: { not: 61 },
                },
                include: { provider: { select: { id: true, name: true, rut: true } } },
            }),
            this.prisma.provider.findMany({
                where: { organizationId },
                select: { id: true, name: true, rut: true },
            }),
            this.prisma.providerAlias.findMany({
                include: { provider: { select: { id: true, name: true, rut: true } } },
            }),
            this.prisma.autoCategoryRule.findMany({
                where: { organizationId, isActive: true, providerId: { not: null } },
                include: { provider: { select: { id: true, name: true, rut: true } } },
            }),
        ]);

        // ── 2. Limpiar DRAFTs previos ────────────────────────────────────────
        if (!dryRun) {
            await this.prisma.reconciliationMatch.deleteMany({
                where: { transactionId: { in: pendingTxs.map(t => t.id) }, status: MatchStatus.DRAFT },
            });
        }

        // ── 3. Pre-indices ──────────────────────────────────────────────────
        const dteByAmount = new Map<number, DteRow[]>();
        const dteByProvRut = new Map<string, DteRow[]>();
        const dteByProvId = new Map<string, DteRow[]>();

        for (const dte of unpaidDtes as DteRow[]) {
            // Por monto
            const amt = dte.totalAmount;
            if (!dteByAmount.has(amt)) dteByAmount.set(amt, []);
            dteByAmount.get(amt)!.push(dte);

            // Por RUT
            const rut = dte.provider?.rut?.replace(/\./g, '') || dte.rutIssuer?.replace(/\./g, '');
            if (rut) {
                if (!dteByProvRut.has(rut)) dteByProvRut.set(rut, []);
                dteByProvRut.get(rut)!.push(dte);
            }

            // Por providerId
            if (dte.provider?.id) {
                if (!dteByProvId.has(dte.provider.id)) dteByProvId.set(dte.provider.id, []);
                dteByProvId.get(dte.provider.id)!.push(dte);
            }
        }

        // Índice de proveedores por RUT normalizado (sin puntos)
        // Se registran múltiples formas para máxima cobertura:
        //   - Con guión:    16751160-0
        //   - Sin guión:    167511600
        //   - Sin guión UP: 167511600
        const provByRut = new Map<string, { id: string; name: string }>();
        for (const p of allProviders) {
            if (!p.rut || p.rut.startsWith('AUTO-')) continue;
            const withDash = p.rut.replace(/\./g, '').toUpperCase();          // 16751160-0
            const withoutDash = withDash.replace(/-/g, '');                    // 167511600
            provByRut.set(withDash, p);
            provByRut.set(withoutDash, p);
        }

        // Alias map: normalized description → providerId
        const aliasMap = new Map<string, string>();
        // RUT alias map: normalized rut → providerId (para P5 coherencia)
        const rutAliasMap = new Map<string, string>();
        // Providers with known RUT aliases (set of providerIds)
        const providersWithRutAliases = new Set<string>();
        for (const a of providerAliases) {
            if (a.description) aliasMap.set(normalize(a.description), a.providerId);
            if ((a as any).rut) {
                const rutKey = (a as any).rut.replace(/\./g, '').replace(/-/g, '').toUpperCase();
                rutAliasMap.set(rutKey, a.providerId);
                providersWithRutAliases.add(a.providerId);
            }
        }

        // AutoCategory rules: keyword → providerId
        const catRules = autoCatRules
            .filter(r => r.providerId)
            .map(r => ({ keyword: normalize(r.keywordMatch), providerId: r.providerId! }));

        // FuzzyName index: normalized word fragment → providerId
        const fuzzyNames = new Map<string, string>();
        const SKIP_WORDS = new Set(['ltda', 'limitada', 'chile', 'servicios', 'comercial', 'spa', 'sociedad', 'transf', 'internet', 'compra', 'normal', 'nacional', 'pago', 'abono']);
        for (const dte of unpaidDtes as DteRow[]) {
            if (!dte.provider) continue;
            const parts = normalize(dte.provider.name).split(/\s+/).filter(p => p.length >= 4 && !SKIP_WORDS.has(p));
            for (const part of parts) fuzzyNames.set(part, dte.provider.id);
        }

        // ── Tracking ────────────────────────────────────────────────────────
        const usedTxIds = new Set<string>();
        const usedDteIds = new Set<string>();
        let p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0, p6 = 0;

        const createDraft = async (txId: string, dteId: string, confidence: number, rule: string) => {
            if (!dryRun) {
                await this.prisma.reconciliationMatch.create({
                    data: { transactionId: txId, dteId, origin: 'AUTOMATIC', status: MatchStatus.DRAFT, confidence, ruleApplied: rule, organizationId },
                });
                await this.prisma.bankTransaction.update({
                    where: { id: txId },
                    data: { status: TransactionStatus.PARTIALLY_MATCHED },
                });
            }
            usedTxIds.add(txId);
            usedDteIds.add(dteId);
        };

        const createSuggestion = async (type: 'SUM' | 'SPLIT', dteId: string, transactionIds: string[], relatedDteIds: string[], totalAmount: number, confidence: number, reason: string) => {
            if (!dryRun) {
                const exists = await this.prisma.matchSuggestion.findFirst({ where: { dteId, type, status: 'PENDING' } });
                if (!exists) {
                    await this.prisma.matchSuggestion.create({
                        data: { type, dteId, transactionIds, relatedDteIds, totalAmount, confidence, status: 'PENDING', reason, organizationId },
                    });
                }
            }
        };

        // ════════════════════════════════════════════════════════════════════
        // PASS 0: RUT-FIRST — metadata.providerRut → proveedor → DTEs
        // ════════════════════════════════════════════════════════════════════
        for (const tx of pendingTxs as TxRow[]) {
            if (usedTxIds.has(tx.id)) continue;

            const metaRut: string | undefined = tx.metadata?.providerRut;
            if (!metaRut) continue;

            // Intentar con y sin guión
            const withDash = metaRut.replace(/\./g, '').toUpperCase();
            const withoutDash = withDash.replace(/-/g, '');
            const provider = provByRut.get(withDash) || provByRut.get(withoutDash);
            if (!provider) continue;

            const provDtes = (dteByProvId.get(provider.id) || []).filter(d => !usedDteIds.has(d.id));
            if (!provDtes.length) continue;

            const txAbs = Math.abs(tx.amount);

            // Sub-pass A: 1:1
            const oneToOne = provDtes
                .map(d => ({ d, ad: Math.abs(Math.abs(d.totalAmount) - txAbs), dd: dateDiffDays(tx.date, d.issuedDate) }))
                .filter(c => c.ad <= amountTolerance && c.dd <= dateWindowDays)
                .sort((a, b) => a.ad - b.ad || a.dd - b.dd);

            if (oneToOne.length > 0) {
                const { d, ad, dd } = oneToOne[0];
                const score = ad === 0 ? 0.95 : 0.85;
                const rule = `[P0-RUT 1:1] ${provider.name} (${metaRut}) | ±$${ad} | ${Math.round(dd)}d`;
                await createDraft(tx.id, d.id, score, rule);
                p0++;
                continue;
            }

            // Sub-pass B: 1:N (subset sum)
            const smaller = provDtes.filter(d => Math.abs(d.totalAmount) < txAbs - amountTolerance);
            if (smaller.length >= 2) {
                const combo = findSubsetSum(smaller.map(d => Math.abs(d.totalAmount)), txAbs, amountTolerance, 5);
                if (combo) {
                    const comboDtes = combo.map(i => smaller[i]);
                    const total = comboDtes.reduce((s, d) => s + Math.abs(d.totalAmount), 0);
                    for (const d of comboDtes) {
                        const dd = Math.round(dateDiffDays(tx.date, d.issuedDate));
                        const rule = `[P0-RUT 1:N] ${provider.name} (${metaRut}) | ${comboDtes.length} DTEs=$${total.toLocaleString('es-CL')} | ${dd}d`;
                        await createDraft(tx.id, d.id, 0.88, rule);
                        usedDteIds.add(d.id);
                    }
                    p0 += comboDtes.length;
                }
            }
        }

        // ════════════════════════════════════════════════════════════════════
        // PASS 1: Monto exacto 1:1 → fecha más cercana
        // ════════════════════════════════════════════════════════════════════
        for (const tx of pendingTxs as TxRow[]) {
            if (usedTxIds.has(tx.id)) continue;
            const txAbs = Math.abs(tx.amount);
            const candidates = (dteByAmount.get(txAbs) || []).filter(d => !usedDteIds.has(d.id));
            if (!candidates.length) continue;

            let best: DteRow | null = null, bestDiff = Infinity;
            for (const d of candidates) {
                const diff = dateDiffDays(tx.date, d.issuedDate);
                if (diff < bestDiff && diff <= dateWindowDays) { bestDiff = diff; best = d; }
            }
            if (!best) continue;

            const rule = `[P1-Exact] $${txAbs.toLocaleString('es-CL')} | ${tx.description?.slice(0, 40)} → F${best.folio} (${best.provider?.name || 'N/A'}) [${Math.round(bestDiff)}d]`;
            await createDraft(tx.id, best.id, confidenceByDate(bestDiff), rule);
            p1++;
        }

        // ════════════════════════════════════════════════════════════════════
        // PASS 2: RUT en descripción + monto ±5%
        // ════════════════════════════════════════════════════════════════════
        for (const tx of pendingTxs as TxRow[]) {
            if (usedTxIds.has(tx.id)) continue;
            const txAbs = Math.abs(tx.amount);
            const rut = extractRutFromDesc(tx.description || '');
            if (!rut) continue;

            const provDtes = (dteByProvRut.get(rut) || []).filter(d => !usedDteIds.has(d.id));
            const candidates = provDtes.filter(d => Math.abs(d.totalAmount - txAbs) / txAbs <= 0.05);
            if (candidates.length !== 1) continue;

            const dte = candidates[0];
            const dd = dateDiffDays(tx.date, dte.issuedDate);
            if (dd > dateWindowDays) continue;

            const rule = `[P2-RUT] RUT:${rut} $${txAbs.toLocaleString('es-CL')} → F${dte.folio} (${dte.provider?.name || 'N/A'}) [${Math.round(dd)}d]`;
            await createDraft(tx.id, dte.id, Math.min(confidenceByDate(dd), 0.88), rule);
            p2++;
        }

        // ════════════════════════════════════════════════════════════════════
        // PASS 3: Alias de proveedor / AutoCategoryRule + monto ±5%
        // ════════════════════════════════════════════════════════════════════
        for (const tx of pendingTxs as TxRow[]) {
            if (usedTxIds.has(tx.id)) continue;
            const txAbs = Math.abs(tx.amount);
            const descNorm = normalize(tx.description || '');

            let provId: string | null = null;
            for (const [aliasNorm, pId] of aliasMap.entries()) {
                if (descNorm.includes(aliasNorm) || aliasNorm.includes(descNorm)) { provId = pId; break; }
            }
            if (!provId) {
                for (const r of catRules) {
                    if (descNorm.includes(r.keyword)) { provId = r.providerId; break; }
                }
            }
            if (!provId) continue;

            const provDtes = (dteByProvId.get(provId) || []).filter(d => !usedDteIds.has(d.id));
            const candidates = provDtes.filter(d => Math.abs(d.totalAmount - txAbs) / Math.max(txAbs, 1) <= 0.05);
            if (candidates.length !== 1) continue;

            const dte = candidates[0];
            const dd = dateDiffDays(tx.date, dte.issuedDate);
            if (dd > dateWindowDays) continue;

            const rule = `[P3-Alias] "${tx.description?.slice(0, 30)}" → ${dte.provider?.name} F${dte.folio} $${txAbs.toLocaleString('es-CL')} [${Math.round(dd)}d]`;
            await createDraft(tx.id, dte.id, Math.min(confidenceByDate(dd), 0.82), rule);
            p3++;
        }

        // ════════════════════════════════════════════════════════════════════
        // PASS 4: FuzzyName (palabra del nombre en descripción) + monto ±3%
        // ════════════════════════════════════════════════════════════════════
        for (const tx of pendingTxs as TxRow[]) {
            if (usedTxIds.has(tx.id)) continue;
            const txAbs = Math.abs(tx.amount);
            const descNorm = normalize(tx.description || '');
            if (descNorm.length < 5) continue;

            let matchedProvId: string | null = null;
            for (const word of descNorm.split(/\s+/).filter(w => w.length >= 4 && !SKIP_WORDS.has(w))) {
                if (fuzzyNames.has(word)) { matchedProvId = fuzzyNames.get(word)!; break; }
            }
            if (!matchedProvId) continue;

            const provDtes = (dteByProvId.get(matchedProvId) || []).filter(d => !usedDteIds.has(d.id));
            const candidates = provDtes.filter(d => Math.abs(d.totalAmount - txAbs) / Math.max(txAbs, 1) <= 0.03);
            if (candidates.length !== 1) continue;

            const dte = candidates[0];
            const dd = dateDiffDays(tx.date, dte.issuedDate);
            if (dd > 60) continue;

            const rule = `[P4-Fuzzy] "${descNorm.slice(0, 25)}" ↔ ${dte.provider?.name} F${dte.folio} $${txAbs.toLocaleString('es-CL')} [${Math.round(dd)}d]`;
            await createDraft(tx.id, dte.id, Math.min(confidenceByDate(dd), 0.75), rule);
            p4++;
        }

        // ════════════════════════════════════════════════════════════════════
        // PASS 5: SUM N:1 — 2 TXs suman ≈ 1 DTE (tolerancia 1%)
        // Regla de coherencia: si una TX tiene RUT conocido (metadata o descripción),
        // SOLO puede participar en un SUM con DTEs de ese mismo proveedor.
        // ════════════════════════════════════════════════════════════════════
        const remDtes = (unpaidDtes as DteRow[]).filter(d => !usedDteIds.has(d.id));
        const remTxs  = (pendingTxs as TxRow[]).filter(t => !usedTxIds.has(t.id));

        // Precalcular el providerId asociado a cada TX (si tiene RUT identificado)
        const txProviderIdCache = new Map<string, string | null>();
        for (const tx of remTxs) {
            // 1. metadata.providerRut
            const metaRut = tx.metadata?.providerRut as string | undefined;
            let resolvedId: string | null = null;
            if (metaRut) {
                const wd = metaRut.replace(/\./g, '').toUpperCase();
                const wod = wd.replace(/-/g, '');
                resolvedId = (provByRut.get(wd) || provByRut.get(wod))?.id
                    || rutAliasMap.get(wd) || rutAliasMap.get(wod) || null;
            }
            // 2. RUT en descripción — buscar en provByRut Y en rutAliasMap
            if (!resolvedId) {
                const descRut = extractRutFromDesc(tx.description || '');
                if (descRut) {
                    const wd = descRut.replace(/\./g, '').replace(/-/g, '').toUpperCase();
                    resolvedId = (provByRut.get(wd) || provByRut.get(descRut.toUpperCase()))?.id
                        || rutAliasMap.get(wd) || null;
                }
            }
            txProviderIdCache.set(tx.id, resolvedId);
        }

        // SUM tolerance 2% (antes 1%) y hasta 3 TXs (antes solo 2)
        const SUM_TOLERANCE = 0.02;

        for (const dte of remDtes) {
            if (usedDteIds.has(dte.id)) continue;
            const target = dte.totalAmount;
            const dteProvId = dte.provider?.id || null;

            // Candidatas: solo TXs no usadas cuyo proveedor coincida (o es desconocido)
            // Modo ESTRICTO: si el proveedor del DTE tiene aliases de RUT conocidos,
            // la TX DEBE tener ese proveedor identificado (null = desconocido → excluir).
            const dteHasRutAliases = dteProvId ? providersWithRutAliases.has(dteProvId) : false;
            const candidates = remTxs.filter(tx => {
                if (usedTxIds.has(tx.id)) return false;
                const txProvId = txProviderIdCache.get(tx.id);
                // Si la TX apunta a un proveedor diferente → excluir siempre
                if (txProvId && dteProvId && txProvId !== dteProvId) return false;
                // Modo estricto: si el DTE tiene RUT aliases, la TX sin proveedor identificado → excluir
                if (dteHasRutAliases && !txProvId) return false;
                return true;
            });

            let found = false;

            // ── Intento 1: par de 2 TXs ──────────────────────────────────
            outer2:
            for (let i = 0; i < candidates.length && !found; i++) {
                const a = Math.abs(candidates[i].amount);
                for (let j = i + 1; j < candidates.length && !found; j++) {
                    const txjProvId = txProviderIdCache.get(candidates[j].id);
                    const txiProvId = txProviderIdCache.get(candidates[i].id);
                    if (txiProvId && txjProvId && txiProvId !== txjProvId) continue;
                    const b = Math.abs(candidates[j].amount);
                    if (Math.abs(a + b - target) / target > SUM_TOLERANCE) continue;
                    const dd1 = dateDiffDays(candidates[i].date, dte.issuedDate);
                    const dd2 = dateDiffDays(candidates[j].date, dte.issuedDate);
                    if (dd1 > 60 || dd2 > 60) continue;
                    const reason = `[P5-SUM2] $${a.toLocaleString('es-CL')}+$${b.toLocaleString('es-CL')}=$${(a+b).toLocaleString('es-CL')} ≈ F${dte.folio} (${dte.provider?.name || 'N/A'})`;
                    await createSuggestion('SUM', dte.id, [candidates[i].id, candidates[j].id], [], a + b, 0.78, reason);
                    usedTxIds.add(candidates[i].id); usedTxIds.add(candidates[j].id);
                    usedDteIds.add(dte.id); p5++; found = true;
                }
            }

            // ── Intento 2: trío de 3 TXs (si no se resolvió con par) ─────
            if (!found) {
                const notUsed = candidates.filter(t => !usedTxIds.has(t.id));
                outer3:
                for (let i = 0; i < notUsed.length && !found; i++) {
                    const a = Math.abs(notUsed[i].amount);
                    if (a > target) continue;
                    for (let j = i + 1; j < notUsed.length && !found; j++) {
                        const b = Math.abs(notUsed[j].amount);
                        if (a + b > target * (1 + SUM_TOLERANCE)) continue;
                        const txjProvId = txProviderIdCache.get(notUsed[j].id);
                        const txiProvId = txProviderIdCache.get(notUsed[i].id);
                        if (txiProvId && txjProvId && txiProvId !== txjProvId) continue;
                        for (let k = j + 1; k < notUsed.length && !found; k++) {
                            const c = Math.abs(notUsed[k].amount);
                            if (Math.abs(a + b + c - target) / target > SUM_TOLERANCE) continue;
                            const txkProvId = txProviderIdCache.get(notUsed[k].id);
                            if (txiProvId && txkProvId && txiProvId !== txkProvId) continue;
                            if (txjProvId && txkProvId && txjProvId !== txkProvId) continue;
                            const dd1 = dateDiffDays(notUsed[i].date, dte.issuedDate);
                            const dd2 = dateDiffDays(notUsed[j].date, dte.issuedDate);
                            const dd3 = dateDiffDays(notUsed[k].date, dte.issuedDate);
                            if (dd1 > 60 || dd2 > 60 || dd3 > 60) continue;
                            const reason = `[P5-SUM3] $${a.toLocaleString('es-CL')}+$${b.toLocaleString('es-CL')}+$${c.toLocaleString('es-CL')}=$${(a+b+c).toLocaleString('es-CL')} ≈ F${dte.folio} (${dte.provider?.name || 'N/A'})`;
                            await createSuggestion('SUM', dte.id, [notUsed[i].id, notUsed[j].id, notUsed[k].id], [], a + b + c, 0.72, reason);
                            usedTxIds.add(notUsed[i].id); usedTxIds.add(notUsed[j].id); usedTxIds.add(notUsed[k].id);
                            usedDteIds.add(dte.id); p5++; found = true;
                        }
                    }
                }
            }
        }


        // ════════════════════════════════════════════════════════════════════
        // PASS 6: SPLIT 1:N — 1 TX paga 2 DTEs del mismo proveedor por RUT
        // ════════════════════════════════════════════════════════════════════
        const finalTxs = (pendingTxs as TxRow[]).filter(t => !usedTxIds.has(t.id));
        const finalDtes = (unpaidDtes as DteRow[]).filter(d => !usedDteIds.has(d.id));

        for (const tx of finalTxs) {
            if (usedTxIds.has(tx.id)) continue;
            const txAbs = Math.abs(tx.amount);
            const rut = extractRutFromDesc(tx.description || '');
            if (!rut) continue;

            const provDtes = finalDtes.filter(d => !usedDteIds.has(d.id) && (d.provider?.rut?.replace(/\./g, '') || d.rutIssuer?.replace(/\./g, '')) === rut);
            if (provDtes.length < 2) continue;

            for (let i = 0; i < provDtes.length; i++) {
                for (let j = i + 1; j < provDtes.length; j++) {
                    const sum = provDtes[i].totalAmount + provDtes[j].totalAmount;
                    if (Math.abs(sum - txAbs) / txAbs > 0.01) continue;

                    const reason = `[P6-SPLIT] $${txAbs.toLocaleString('es-CL')} → F${provDtes[i].folio}+F${provDtes[j].folio} (${provDtes[i].provider?.name || 'N/A'})`;
                    await createSuggestion('SPLIT', provDtes[i].id, [tx.id], [provDtes[j].id], txAbs, 0.75, reason);
                    usedTxIds.add(tx.id);
                    usedDteIds.add(provDtes[i].id);
                    usedDteIds.add(provDtes[j].id);
                    p6++;
                    break;
                }
                if (usedTxIds.has(tx.id)) break;
            }
        }

        // ── Resultado ────────────────────────────────────────────────────────
        return {
            processed: pendingTxs.length,
            pass0Rut: p0,
            pass1Exact: p1,
            pass2RutAmount: p2,
            pass3Alias: p3,
            pass4Fuzzy: p4,
            pass5Sum: p5,
            pass6Split: p6,
            totalDrafts: p0 + p1 + p2 + p3 + p4,
            totalSuggestions: p5 + p6,
            stillPending: pendingTxs.length - usedTxIds.size,
        };
    }
}
