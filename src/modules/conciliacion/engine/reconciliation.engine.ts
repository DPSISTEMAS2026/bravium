import { PrismaClient, MatchStatus, TransactionStatus } from '@prisma/client';

export interface EngineOptions {
    organizationId: string;
    dryRun?: boolean;
}

export interface EngineResult {
    processed: number;
    pass1Exact: number;
    totalDrafts: number;
    stillPending: number;
    phase2RutsExtracted: number;
    phase3ProvidersResolved: number;
    phase5DtePendiente: number;
}

interface TxRow {
    id: string;
    date: Date;
    amount: number;
    type: string; // 'DEBIT' o 'CREDIT'
    description: string | null;
    metadata: any;
    bankAccount: { bankName: string; accountNumber: string; organizationId: string };
    /** Proveedor resuelto por RUT en FASE 3 (transitorio, no persistido en el modelo) */
    _resolvedProvider?: { id: string; name: string; rut: string } | null;
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

// Funciones de validación de RUT eliminadas por regla de 1:1 estricto

function dateDiffDays(a: Date, b: Date): number {
    return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

// ════════════════════════════════════════════════════════════════════════════════
// REGEX ROBUSTO PARA EXTRAER RUT CHILENO DE GLOSAS BANCARIAS
// Soporta formatos: 76.794.035-1, 76794035-1, 767940351, 0767940351
// Regla 10 AGENTS.md: longitud mínima 6 caracteres alfanuméricos válidos.
// ════════════════════════════════════════════════════════════════════════════════
const RUT_PATTERNS = [
    // Formato con puntos y guión: 76.794.035-1
    /(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])\b/i,
    // Formato sin puntos pero con guión: 76794035-1
    /\b(\d{7,8}-[\dkK])\b/i,
    // Formato numérico puro (8-9 dígitos): 767940351
    /\b0?(\d{7,8})([\dkK])\b/i,
];

function extractRutFromDescription(desc: string | null): string | null {
    if (!desc) return null;

    for (const pattern of RUT_PATTERNS) {
        const m = desc.match(pattern);
        if (!m) continue;

        // Normalizar: quitar puntos, guiones, ceros iniciales
        let raw: string;
        if (m[2] !== undefined) {
            // Patrón 3 (dos grupos de captura): cuerpo + dígito verificador
            raw = m[1] + m[2];
        } else {
            raw = m[1];
        }

        const clean = raw.replace(/\./g, '').replace(/-/g, '').toUpperCase();

        // Regla 10 AGENTS.md: longitud mínima 6 caracteres alfanuméricos válidos
        if (clean.length < 6) continue;

        // Rechazar strings genéricos (ej. "000000", "00000000")
        if (/^0+\d?$/.test(clean)) continue;

        // Formatear como CUERPO-DV
        const body = clean.slice(0, -1);
        const dv = clean.slice(-1);
        return `${body}-${dv}`;
    }

    return null;
}

/**
 * Normaliza un RUT a solo caracteres alfanuméricos en mayúsculas (sin puntos ni guiones).
 * Ej: "76.794.035-1" → "767940351"
 */
function normalizeRut(rut: string): string {
    return rut.replace(/[^0-9Kk]/g, '').toUpperCase();
}

export class ReconciliationEngine {
    constructor(private readonly prisma: PrismaClient) {}

    async run(opts: EngineOptions): Promise<EngineResult> {
        const { organizationId, dryRun = false } = opts;
        const lookbackDate = new Date('2026-01-01T00:00:00.000Z');
        const maxDaysWindow = 90;

        // ── 1. Cargar datos ──────────────────────────────────────────────────
        // Ahora cargamos DEBIT y CREDIT para respetar la Ley de Signo
        const tLoad = Date.now();
        const [pendingTxs, unpaidDtes, allProviders] = await Promise.all([
            this.prisma.bankTransaction.findMany({
                where: {
                    status: { in: [TransactionStatus.PENDING, TransactionStatus.PARTIALLY_MATCHED] },
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
                    type: { not: 61 }, // Notas de Crédito jamás van contra banco
                },
                include: { provider: { select: { id: true, name: true, rut: true } } },
            }),
            this.prisma.provider.findMany({
                where: { organizationId },
                select: { id: true, name: true, rut: true },
            }),
        ]);

        const usedTxIds = new Set<string>();
        const usedDteIds = new Set<string>();

        let p1 = 0;
        let drafts = 0;
        let phase2RutsExtracted = 0;
        let phase3ProvidersResolved = 0;
        let phase5DtePendiente = 0;

        const pendingMatchesToCreate: any[] = [];
        const matchedTxIds = new Set<string>();
        const paidDteIds = new Set<string>();

        const createMatch = async (txId: string, dteId: string, rule: string) => {
            if (dryRun) return;
            pendingMatchesToCreate.push({
                transactionId: txId,
                dteId,
                origin: 'AUTOMATIC',
                status: MatchStatus.CONFIRMED,
                confidence: 1.0,
                ruleApplied: rule,
                organizationId,
            });

            matchedTxIds.add(txId);
            paidDteIds.add(dteId);
            p1++;
            usedTxIds.add(txId);
            usedDteIds.add(dteId);
        };

        // ════════════════════════════════════════════════════════════════════
        // FASE 2: EXTRACCIÓN Y ENRIQUECIMIENTO DE RUTs DESDE GLOSAS
        // ════════════════════════════════════════════════════════════════════
        const metadataUpdates: { id: string; metadata: any }[] = [];

        for (const tx of pendingTxs as TxRow[]) {
            const existingRut = tx.metadata?.providerRut;
            if (existingRut) continue; // Ya tiene RUT extraído en la ingesta

            const extractedRut = extractRutFromDescription(tx.description);
            if (extractedRut) {
                tx.metadata = { ...(tx.metadata || {}), providerRut: extractedRut };
                metadataUpdates.push({ id: tx.id, metadata: tx.metadata });
                phase2RutsExtracted++;
            }
        }

        // Persistir RUTs extraídos en batch (fuera del loop para eficiencia)
        const tPhase2 = Date.now();
        if (!dryRun && metadataUpdates.length > 0) {
            for (const upd of metadataUpdates) {
                await this.prisma.bankTransaction.update({
                    where: { id: upd.id },
                    data: { metadata: upd.metadata },
                });
            }
        }

        // ════════════════════════════════════════════════════════════════════
        // FASE 3: CRUCE RUT → PROVEEDOR EN BASE DE DATOS
        // Construir índice de proveedores por RUT normalizado.
        // Soporta RUT completo y cuerpo sin DV para máxima cobertura.
        // ════════════════════════════════════════════════════════════════════
        const providerByRut = new Map<string, { id: string; name: string; rut: string }>();
        for (const p of allProviders) {
            if (!p.rut) continue;
            const clean = normalizeRut(p.rut);
            // Regla 10: solo indexar RUTs con longitud mínima 6
            if (clean.length < 6) continue;
            providerByRut.set(clean, p);
            // También indexar por cuerpo sin DV (ej. "76794035")
            if (clean.length >= 8) providerByRut.set(clean.slice(0, -1), p);
        }

        for (const tx of pendingTxs as TxRow[]) {
            const rut = tx.metadata?.providerRut;
            if (!rut) continue;

            const clean = normalizeRut(rut);
            if (clean.length < 6) continue;

            const provider = providerByRut.get(clean) || providerByRut.get(clean.slice(0, -1));
            if (provider) {
                tx._resolvedProvider = provider;
                phase3ProvidersResolved++;
            }
        }

        // ════════════════════════════════════════════════════════════════════
        // FASE 4: LEY ABSOLUTA DE CONCILIACIÓN (TOLERANCIA ±$10)
        // Match 1:1 por Monto + Dirección Financiera + Ventana de Fecha.
        // MEJORA: Cuando una TX tiene proveedor resuelto por RUT (FASE 3),
        // priorizar DTEs de ese mismo proveedor para evitar ambigüedad.
        // ════════════════════════════════════════════════════════════════════
        for (const tx of pendingTxs as TxRow[]) {
            if (usedTxIds.has(tx.id)) continue;

            const isEgreso = tx.amount < 0 || tx.type === 'DEBIT';
            const isIngreso = tx.amount > 0 || tx.type === 'CREDIT';
            const txAbs = Math.abs(tx.amount);

            // Filtrar DTEs por dirección financiera y tolerancia cero
            let validDtes = unpaidDtes.filter(d => {
                if (usedDteIds.has(d.id)) return false;
                
                // Tipo 33, 34, 56 -> Compras (Gastos) -> Requiere Egreso
                const isCompra = [33, 34, 56].includes(d.type);
                
                if (isCompra && !isEgreso) return false;
                if (!isCompra && !isIngreso) return false;

                // LEY SAGRADA (FLEXIBILIZADA): Tolerancia de +/- 10 pesos
                const diffMonto = Math.abs(Math.abs(d.totalAmount) - txAbs);
                if (diffMonto > 10) return false;

                // Restricción de Fecha
                const diff = dateDiffDays(tx.date, d.issuedDate);
                if (diff > maxDaysWindow) return false;

                return true;
            });

            if (validDtes.length === 0) continue;

            // PRIORIZACIÓN POR PROVEEDOR RESUELTO (FASE 3)
            // Si la TX tiene un proveedor identificado por RUT, filtrar DTEs de ese proveedor.
            // Si hay DTEs del mismo proveedor, usar solo esos. Si no, usar todos los candidatos.
            if (tx._resolvedProvider) {
                const fromSameProvider = validDtes.filter(
                    d => d.providerId === tx._resolvedProvider!.id
                );
                if (fromSameProvider.length > 0) {
                    validDtes = fromSameProvider;
                }
            }

            // Ordenar por cercanía en fecha
            validDtes.sort((a, b) => dateDiffDays(tx.date, a.issuedDate) - dateDiffDays(tx.date, b.issuedDate));

            // Evaluamos el mejor candidato (el más cercano en fecha)
            const matchedDte = validDtes[0];

            const diffMontoFinal = Math.abs(Math.abs(matchedDte.totalAmount) - txAbs);
            const toleranceMsg = diffMontoFinal > 0 ? ` (Diferencia: $${diffMontoFinal})` : '';

            const providerInfo = tx._resolvedProvider
                ? ` + RUT ${tx.metadata?.providerRut} → ${tx._resolvedProvider.name}`
                : '';

            const ruleDesc = `[LEY SAGRADA] Match 1:1 por Monto${toleranceMsg}${providerInfo}`;

            await createMatch(tx.id, matchedDte.id, ruleDesc);
        }

        // ════════════════════════════════════════════════════════════════════
        // FASE 5: PROVEEDOR IDENTIFICADO SIN DTE → "DTE PENDIENTE"
        // Movimientos con proveedor resuelto por RUT pero sin DTE matcheable.
        // NO se marcan como MATCHED (Regla 3: Zero Forced Approvals).
        // Se enriquece metadata para que la UI muestre "NOMBRE - DTE Pendiente".
        // ════════════════════════════════════════════════════════════════════
        const dtePendienteUpdates: { id: string; metadata: any }[] = [];

        for (const tx of pendingTxs as TxRow[]) {
            if (usedTxIds.has(tx.id)) continue;          // Ya matcheado en FASE 4
            if (!tx._resolvedProvider) continue;          // No tiene proveedor resuelto

            const provider = tx._resolvedProvider;

            const updatedMeta = {
                ...(tx.metadata || {}),
                identifiedProviderId: provider.id,
                identifiedProviderName: provider.name,
                dtePendiente: true,
            };

            dtePendienteUpdates.push({ id: tx.id, metadata: updatedMeta });
            phase5DtePendiente++;
        }

        // Persistir "DTE Pendiente" en batch
        const tPhase5 = Date.now();
        if (!dryRun && dtePendienteUpdates.length > 0) {
            for (const upd of dtePendienteUpdates) {
                await this.prisma.bankTransaction.update({
                    where: { id: upd.id },
                    data: { metadata: upd.metadata },
                });
            }
        }

        // ── Persistir Matches en BD ──────────────────────────────────────────
        if (!dryRun && pendingMatchesToCreate.length > 0) {
            await this.prisma.reconciliationMatch.createMany({
                data: pendingMatchesToCreate,
                skipDuplicates: true,
            });

            if (matchedTxIds.size > 0) {
                await this.prisma.bankTransaction.updateMany({
                    where: { id: { in: Array.from(matchedTxIds) } },
                    data: { status: TransactionStatus.MATCHED, updatedAt: new Date() },
                });
            }

            if (paidDteIds.size > 0) {
                await this.prisma.dTE.updateMany({
                    where: { id: { in: Array.from(paidDteIds) } },
                    data: { paymentStatus: 'PAID', outstandingAmount: 0, updatedAt: new Date() },
                });
            }
        }

        return {
            processed: pendingTxs.length,
            pass1Exact: p1,
            totalDrafts: 0,
            stillPending: pendingTxs.length - p1 - phase5DtePendiente,
            phase2RutsExtracted,
            phase3ProvidersResolved,
            phase5DtePendiente,
        };
    }
}
