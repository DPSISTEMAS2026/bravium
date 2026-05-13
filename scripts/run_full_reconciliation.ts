/**
 * run_full_reconciliation.ts
 * 
 * Motor de conciliación completo con múltiples estrategias:
 *  1. Match Exacto por Monto (1:1)
 *  2. Match por RUT en descripción bancaria
 *  3. Match por Alias de Proveedor (ProviderAlias)
 *  4. Match por nombre de proveedor fuzzy en descripción
 *  5. Suma de transacciones → 1 DTE (N:1)
 *  6. 1 Transacción → múltiples DTEs (1:N split)
 * 
 * Uso: npx ts-node scripts/run_full_reconciliation.ts [--dry-run]
 */

import { PrismaClient, TransactionType, TransactionStatus, MatchStatus } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Helpers ──────────────────────────────────────────────────
function normalize(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function extractRut(desc: string): string | null {
  const m = desc.match(/(\d{1,2}[\.\d]*\d-[\dkK])/);
  if (!m) return null;
  return m[1].replace(/\./g, '');
}

function dateDiffDays(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function confidenceByDateDiff(days: number): number {
  if (days <= 3) return 0.97;
  if (days <= 7) return 0.95;
  if (days <= 14) return 0.90;
  if (days <= 30) return 0.85;
  if (days <= 60) return 0.75;
  return 0.65;
}

// ─── Types ──────────────────────────────────────────────────
interface TxRow {
  id: string;
  date: Date;
  amount: number;
  description: string | null;
  reference: string | null;
  bankAccount: { bankName: string; accountNumber: string };
}

interface DteRow {
  id: string;
  folio: number;
  type: number;
  totalAmount: number;
  outstandingAmount: number;
  issuedDate: Date;
  rutIssuer: string;
  provider: { id: string; name: string; rut: string } | null;
}

// ─── Main ──────────────────────────────────────────────────
async function main() {
  console.log('\n' + '='.repeat(70));
  console.log(`  MOTOR DE CONCILIACIÓN COMPLETO ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
  console.log('  Fecha:', new Date().toISOString());
  console.log('='.repeat(70) + '\n');

  const org = await prisma.organization.findFirst({
    where: { isActive: true, fintocApiKey: { not: null } }
  });
  if (!org) throw new Error('No org found');
  console.log(`📌 Organización: ${org.name}\n`);

  // ─── 1. Cargar datos ──────────────────────────────────────
  const today = new Date();
  const lookbackDate = new Date(today);
  lookbackDate.setDate(lookbackDate.getDate() - 120); // 4 meses atrás

  const pendingTxs = await prisma.bankTransaction.findMany({
    where: {
      status: { in: [TransactionStatus.PENDING, TransactionStatus.PARTIALLY_MATCHED] },
      type: TransactionType.DEBIT,
      date: { gte: lookbackDate, lte: today },
      bankAccount: { organizationId: org.id }
    },
    include: { bankAccount: { select: { bankName: true, accountNumber: true } } },
    orderBy: { date: 'asc' }
  });

  const unpaidDtes = await prisma.dTE.findMany({
    where: {
      paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
      organizationId: org.id,
      type: { not: 61 } // Excluir notas de crédito
    },
    include: { provider: { select: { id: true, name: true, rut: true } } }
  });

  const providerAliases = await prisma.providerAlias.findMany({
    include: { provider: { select: { id: true, name: true, rut: true } } }
  });

  const autoCatRules = await prisma.autoCategoryRule.findMany({
    where: { organizationId: org.id, isActive: true },
    include: { provider: { select: { id: true, name: true, rut: true } } }
  });

  console.log(`📋 Transacciones PENDING (DEBIT): ${pendingTxs.length}`);
  console.log(`📋 DTEs UNPAID/PARTIAL disponibles: ${unpaidDtes.length}`);
  console.log(`📋 Aliases de proveedor: ${providerAliases.length}`);
  console.log(`📋 Reglas AutoCategory: ${autoCatRules.length}\n`);

  // ─── 2. Limpiar DRAFT previos ─────────────────────────────
  const txIds = pendingTxs.map(t => t.id);
  if (!DRY_RUN) {
    const deletedDrafts = await prisma.reconciliationMatch.deleteMany({
      where: { transactionId: { in: txIds }, status: MatchStatus.DRAFT }
    });
    if (deletedDrafts.count > 0) {
      console.log(`🧹 Limpiados ${deletedDrafts.count} DRAFT previos\n`);
    }
  }

  // ─── Tracking ─────────────────────────────────────────────
  const usedDteIds = new Set<string>();
  const usedTxIds = new Set<string>();
  let totalMatches = 0;

  // Pre-index: DTEs by amount (para búsqueda rápida)
  const dteByAmount = new Map<number, DteRow[]>();
  for (const dte of unpaidDtes) {
    const amt = dte.totalAmount;
    if (!dteByAmount.has(amt)) dteByAmount.set(amt, []);
    dteByAmount.get(amt)!.push(dte as any);
  }

  // Pre-index: DTEs by provider RUT
  const dteByProvRut = new Map<string, DteRow[]>();
  for (const dte of unpaidDtes) {
    const rut = dte.provider?.rut?.replace(/\./g, '') || dte.rutIssuer?.replace(/\./g, '');
    if (rut) {
      if (!dteByProvRut.has(rut)) dteByProvRut.set(rut, []);
      dteByProvRut.get(rut)!.push(dte as any);
    }
  }

  // Pre-index: DTEs by provider ID
  const dteByProvId = new Map<string, DteRow[]>();
  for (const dte of unpaidDtes) {
    if (dte.provider?.id) {
      if (!dteByProvId.has(dte.provider.id)) dteByProvId.set(dte.provider.id, []);
      dteByProvId.get(dte.provider.id)!.push(dte as any);
    }
  }

  // Alias lookup: normalizado(description) → providerId
  const aliasMap = new Map<string, string>();
  for (const alias of providerAliases) {
    aliasMap.set(normalize(alias.description), alias.providerId);
  }

  // AutoCategory lookup: keyword → providerId
  const catRuleMap = autoCatRules
    .filter(r => r.providerId)
    .map(r => ({ keyword: normalize(r.keywordMatch), providerId: r.providerId! }));

  // Helper: crear match
  async function createMatch(txId: string, dteId: string, confidence: number, rule: string) {
    if (DRY_RUN) {
      console.log(`  🆕 [DRY] ${rule}`);
    } else {
      await prisma.reconciliationMatch.create({
        data: {
          transactionId: txId,
          dteId,
          origin: 'AUTOMATIC',
          status: MatchStatus.DRAFT,
          confidence,
          ruleApplied: rule,
          organizationId: org.id,
        }
      });
      await prisma.bankTransaction.update({
        where: { id: txId },
        data: { status: TransactionStatus.PARTIALLY_MATCHED }
      });
    }
    usedTxIds.add(txId);
    usedDteIds.add(dteId);
    totalMatches++;
  }

  // ╔══════════════════════════════════════════════════════════╗
  // ║  ESTRATEGIA 1: Match Exacto por Monto (1:1)            ║
  // ╚══════════════════════════════════════════════════════════╝
  console.log('🔍 Estrategia 1: Match exacto por monto...');
  let s1 = 0;

  for (const tx of pendingTxs) {
    if (usedTxIds.has(tx.id)) continue;
    const txAmt = Math.abs(tx.amount);

    const candidates = (dteByAmount.get(txAmt) || [])
      .filter(d => !usedDteIds.has(d.id));

    if (candidates.length === 0) continue;

    // Preferir el candidato con fecha más cercana
    let best: DteRow | null = null;
    let bestDiff = Infinity;
    for (const c of candidates) {
      const diff = dateDiffDays(new Date(tx.date), new Date(c.issuedDate));
      if (diff < bestDiff && diff <= 90) {
        bestDiff = diff;
        best = c;
      }
    }

    if (best) {
      const conf = confidenceByDateDiff(bestDiff);
      const rule = `ExactAmount | $${txAmt.toLocaleString()} | ${tx.description?.slice(0, 35)} → F${best.folio} (${best.provider?.name || 'N/A'}) [${bestDiff.toFixed(0)}d]`;
      await createMatch(tx.id, best.id, conf, rule);
      console.log(`  ✅ ${rule}`);
      s1++;
    }
  }
  console.log(`  → ${s1} matches\n`);

  // ╔══════════════════════════════════════════════════════════╗
  // ║  ESTRATEGIA 2: Match por RUT en descripción             ║
  // ╚══════════════════════════════════════════════════════════╝
  console.log('🔍 Estrategia 2: Match por RUT en descripción...');
  let s2 = 0;

  for (const tx of pendingTxs) {
    if (usedTxIds.has(tx.id)) continue;
    const txAmt = Math.abs(tx.amount);
    const rut = extractRut(tx.description || '');
    if (!rut) continue;

    const provDtes = (dteByProvRut.get(rut) || [])
      .filter(d => !usedDteIds.has(d.id));

    // Buscar match con tolerancia ±5%
    const candidates = provDtes.filter(d => {
      const diff = Math.abs(d.totalAmount - txAmt) / txAmt;
      return diff <= 0.05;
    });

    if (candidates.length === 1) {
      const dte = candidates[0];
      const dd = dateDiffDays(new Date(tx.date), new Date(dte.issuedDate));
      if (dd > 90) continue;

      const conf = Math.min(confidenceByDateDiff(dd), 0.88);
      const rule = `RUT+Amount | RUT:${rut} $${txAmt.toLocaleString()} → F${dte.folio} (${dte.provider?.name || 'N/A'}) [${dd.toFixed(0)}d]`;
      await createMatch(tx.id, dte.id, conf, rule);
      console.log(`  ✅ ${rule}`);
      s2++;
    }
  }
  console.log(`  → ${s2} matches\n`);

  // ╔══════════════════════════════════════════════════════════╗
  // ║  ESTRATEGIA 3: Match por Alias de Proveedor             ║
  // ╚══════════════════════════════════════════════════════════╝
  console.log('🔍 Estrategia 3: Match por alias de proveedor...');
  let s3 = 0;

  for (const tx of pendingTxs) {
    if (usedTxIds.has(tx.id)) continue;
    const txAmt = Math.abs(tx.amount);
    const descNorm = normalize(tx.description || '');

    // Buscar en aliases directos
    let provId: string | null = null;

    for (const [aliasNorm, pId] of aliasMap.entries()) {
      if (descNorm.includes(aliasNorm) || aliasNorm.includes(descNorm)) {
        provId = pId;
        break;
      }
    }

    // Buscar en AutoCategoryRules
    if (!provId) {
      for (const rule of catRuleMap) {
        if (descNorm.includes(rule.keyword)) {
          provId = rule.providerId;
          break;
        }
      }
    }

    if (!provId) continue;

    const provDtes = (dteByProvId.get(provId) || [])
      .filter(d => !usedDteIds.has(d.id));

    // Match exacto o ±5%
    const candidates = provDtes.filter(d => {
      const diff = Math.abs(d.totalAmount - txAmt) / Math.max(txAmt, 1);
      return diff <= 0.05;
    });

    if (candidates.length === 1) {
      const dte = candidates[0];
      const dd = dateDiffDays(new Date(tx.date), new Date(dte.issuedDate));
      if (dd > 90) continue;

      const conf = Math.min(confidenceByDateDiff(dd), 0.82);
      const rule = `Alias+Amount | "${tx.description?.slice(0, 30)}" → Prov:${dte.provider?.name} F${dte.folio} $${txAmt.toLocaleString()} [${dd.toFixed(0)}d]`;
      await createMatch(tx.id, dte.id, conf, rule);
      console.log(`  ✅ ${rule}`);
      s3++;
    }
  }
  console.log(`  → ${s3} matches\n`);

  // ╔══════════════════════════════════════════════════════════╗
  // ║  ESTRATEGIA 4: Fuzzy name match (nombre proveedor)      ║
  // ╚══════════════════════════════════════════════════════════╝
  console.log('🔍 Estrategia 4: Match fuzzy por nombre de proveedor...');
  let s4 = 0;

  // Build a list of unique providers with DTEs
  const provNames = new Map<string, string>(); // normalized name fragment → providerId
  for (const dte of unpaidDtes) {
    if (!dte.provider) continue;
    const parts = normalize(dte.provider.name).split(/\s+/).filter(p => p.length >= 4);
    for (const part of parts) {
      // Skip generic words
      if (['ltda', 'limitada', 'chile', 'servicios', 'comercial', 'spa', 'sociedad'].includes(part)) continue;
      provNames.set(part, dte.provider.id);
    }
  }

  for (const tx of pendingTxs) {
    if (usedTxIds.has(tx.id)) continue;
    const txAmt = Math.abs(tx.amount);
    const descNorm = normalize(tx.description || '');
    if (descNorm.length < 5) continue;

    // Extract words from tx description
    const descWords = descNorm.split(/\s+/).filter(w => w.length >= 4);
    
    // Find provider whose name fragment matches
    let matchedProvId: string | null = null;
    let matchedWord = '';
    for (const word of descWords) {
      if (['transf', 'internet', 'compra', 'normal', 'nacional', 'pago', 'transfer', 'abono'].includes(word)) continue;
      if (provNames.has(word)) {
        matchedProvId = provNames.get(word)!;
        matchedWord = word;
        break;
      }
    }

    if (!matchedProvId) continue;

    const provDtes = (dteByProvId.get(matchedProvId) || [])
      .filter(d => !usedDteIds.has(d.id));

    // Match con tolerancia ±3%
    const candidates = provDtes.filter(d => {
      const diff = Math.abs(d.totalAmount - txAmt) / Math.max(txAmt, 1);
      return diff <= 0.03;
    });

    if (candidates.length === 1) {
      const dte = candidates[0];
      const dd = dateDiffDays(new Date(tx.date), new Date(dte.issuedDate));
      if (dd > 60) continue;

      const conf = Math.min(confidenceByDateDiff(dd), 0.75);
      const rule = `FuzzyName | "${matchedWord}" ↔ ${dte.provider?.name} | $${txAmt.toLocaleString()} → F${dte.folio} [${dd.toFixed(0)}d]`;
      await createMatch(tx.id, dte.id, conf, rule);
      console.log(`  ✅ ${rule}`);
      s4++;
    }
  }
  console.log(`  → ${s4} matches\n`);

  // ╔══════════════════════════════════════════════════════════╗
  // ║  ESTRATEGIA 5: Suma de transacciones → 1 DTE (N:1)     ║
  // ╚══════════════════════════════════════════════════════════╝
  console.log('🔍 Estrategia 5: N transacciones → 1 DTE (suma)...');
  let s5 = 0;

  // Para cada DTE sin match, ver si alguna combinación de 2-3 txs suman al monto
  const remainingDtes = unpaidDtes.filter(d => !usedDteIds.has(d.id));
  const remainingTxs = pendingTxs.filter(t => !usedTxIds.has(t.id));

  for (const dte of remainingDtes) {
    if (usedDteIds.has(dte.id)) continue;
    const target = dte.totalAmount;

    // Combinaciones de 2
    for (let i = 0; i < remainingTxs.length; i++) {
      if (usedTxIds.has(remainingTxs[i].id)) continue;
      const a = Math.abs(remainingTxs[i].amount);

      for (let j = i + 1; j < remainingTxs.length; j++) {
        if (usedTxIds.has(remainingTxs[j].id)) continue;
        const b = Math.abs(remainingTxs[j].amount);

        const sum = a + b;
        const diff = Math.abs(sum - target) / target;

        if (diff <= 0.01) { // 1% tolerancia para sumas
          // Verificar que ambas están dentro de 60 días de la factura
          const dd1 = dateDiffDays(new Date(remainingTxs[i].date), new Date(dte.issuedDate));
          const dd2 = dateDiffDays(new Date(remainingTxs[j].date), new Date(dte.issuedDate));
          if (dd1 > 60 || dd2 > 60) continue;

          // Crear MatchSuggestion (N:1)
          if (!DRY_RUN) {
            await prisma.matchSuggestion.create({
              data: {
                type: 'SUM',
                dteId: dte.id,
                transactionIds: [remainingTxs[i].id, remainingTxs[j].id],
                totalAmount: sum,
                confidence: 0.78,
                status: 'PENDING',
                reason: `SumMatch | $${a.toLocaleString()} + $${b.toLocaleString()} = $${sum.toLocaleString()} ≈ F${dte.folio} ($${target.toLocaleString()})`,
                organizationId: org.id,
              }
            });
          }

          console.log(`  💡 SUM: $${a.toLocaleString()} + $${b.toLocaleString()} = $${sum.toLocaleString()} → F${dte.folio} (${dte.provider?.name || 'N/A'}) [$${target.toLocaleString()}]`);
          usedTxIds.add(remainingTxs[i].id);
          usedTxIds.add(remainingTxs[j].id);
          usedDteIds.add(dte.id);
          s5++;
          break;
        }
      }
      if (usedDteIds.has(dte.id)) break;
    }
  }
  console.log(`  → ${s5} sugerencias SUM\n`);

  // ╔══════════════════════════════════════════════════════════╗
  // ║  ESTRATEGIA 6: 1 Transacción → N DTEs (split)          ║
  // ╚══════════════════════════════════════════════════════════╝
  console.log('🔍 Estrategia 6: 1 transacción → N DTEs (split)...');
  let s6 = 0;

  const stillRemainingTxs = pendingTxs.filter(t => !usedTxIds.has(t.id));
  const stillRemainingDtes = unpaidDtes.filter(d => !usedDteIds.has(d.id));

  for (const tx of stillRemainingTxs) {
    if (usedTxIds.has(tx.id)) continue;
    const txAmt = Math.abs(tx.amount);

    // Identificar proveedor por RUT o alias
    const rut = extractRut(tx.description || '');
    let provDtes: DteRow[] = [];

    if (rut) {
      provDtes = stillRemainingDtes.filter(d => {
        if (usedDteIds.has(d.id)) return false;
        const pRut = d.provider?.rut?.replace(/\./g, '') || d.rutIssuer?.replace(/\./g, '');
        return pRut === rut;
      }) as any;
    }

    if (provDtes.length < 2) continue;

    // Intentar combinaciones de 2 DTEs que sumen al monto de la transacción
    for (let i = 0; i < provDtes.length; i++) {
      for (let j = i + 1; j < provDtes.length; j++) {
        const sum = provDtes[i].totalAmount + provDtes[j].totalAmount;
        const diff = Math.abs(sum - txAmt) / txAmt;

        if (diff <= 0.01) {
          if (!DRY_RUN) {
            await prisma.matchSuggestion.create({
              data: {
                type: 'SPLIT',
                dteId: provDtes[i].id,
                transactionIds: [tx.id],
                relatedDteIds: [provDtes[j].id],
                totalAmount: txAmt,
                confidence: 0.75,
                status: 'PENDING',
                reason: `SplitMatch | $${txAmt.toLocaleString()} → F${provDtes[i].folio} ($${provDtes[i].totalAmount.toLocaleString()}) + F${provDtes[j].folio} ($${provDtes[j].totalAmount.toLocaleString()})`,
                organizationId: org.id,
              }
            });
          }

          console.log(`  💡 SPLIT: $${txAmt.toLocaleString()} → F${provDtes[i].folio} + F${provDtes[j].folio} (${provDtes[i].provider?.name || 'N/A'})`);
          usedTxIds.add(tx.id);
          usedDteIds.add(provDtes[i].id);
          usedDteIds.add(provDtes[j].id);
          s6++;
          break;
        }
      }
      if (usedTxIds.has(tx.id)) break;
    }
  }
  console.log(`  → ${s6} sugerencias SPLIT\n`);

  // ╔══════════════════════════════════════════════════════════╗
  // ║  RESUMEN FINAL                                          ║
  // ╚══════════════════════════════════════════════════════════╝
  const stillPending = pendingTxs.length - usedTxIds.size;

  console.log('='.repeat(70));
  console.log(`  RESUMEN CONCILIACIÓN COMPLETA ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(70));
  console.log(`  📋 Transacciones procesadas:     ${pendingTxs.length}`);
  console.log(`  ─────────────────────────────────────────────`);
  console.log(`  ✅ E1 - Match exacto por monto:  ${s1}`);
  console.log(`  ✅ E2 - Match por RUT:           ${s2}`);
  console.log(`  ✅ E3 - Match por alias:          ${s3}`);
  console.log(`  ✅ E4 - Match fuzzy nombre:       ${s4}`);
  console.log(`  💡 E5 - Sugerencias SUM (N:1):    ${s5}`);
  console.log(`  💡 E6 - Sugerencias SPLIT (1:N):  ${s6}`);
  console.log(`  ─────────────────────────────────────────────`);
  console.log(`  ✅ Total matches DRAFT:           ${s1 + s2 + s3 + s4}`);
  console.log(`  💡 Total sugerencias:             ${s5 + s6}`);
  console.log(`  ⏳ Sin match (pendientes):        ${stillPending}`);
  console.log(`  📑 DTEs usados:                   ${usedDteIds.size} / ${unpaidDtes.length}`);
  console.log('='.repeat(70));

  if (!DRY_RUN) {
    console.log('\n💡 Matches DRAFT → confirmar en dashboard de conciliación');
    console.log('💡 Sugerencias SUM/SPLIT → revisar en la sección de sugerencias\n');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
