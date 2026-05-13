import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
    const org = await p.organization.findFirst({ where: { isActive: true } });
    const orgId = org!.id;
    const from2026 = new Date('2026-01-01');

    // ── Movimientos bancarios 2026 ─────────────────────────────────────────
    const txs = await p.bankTransaction.findMany({
        where: { date: { gte: from2026 }, bankAccount: { organizationId: orgId } },
        select: { id: true, amount: true, date: true, type: true, status: true, metadata: true },
        orderBy: { date: 'desc' }
    });

    const lastTxDate = txs.length > 0 ? txs[0].date : null;
    const firstTxDate = txs.length > 0 ? txs[txs.length - 1].date : null;

    const txDebit  = txs.filter(t => t.type === 'DEBIT');
    const txCredit = txs.filter(t => t.type === 'CREDIT');

    // Por status
    const byStatus: Record<string, { count: number; sum: number }> = {};
    for (const t of txDebit) {
        if (!byStatus[t.status]) byStatus[t.status] = { count: 0, sum: 0 };
        byStatus[t.status].count++;
        byStatus[t.status].sum += Math.abs(t.amount);
    }

    // Por mes
    const byMonth: Record<string, { count: number; debit: number; credit: number }> = {};
    for (const t of txs) {
        const key = t.date.toISOString().slice(0, 7);
        if (!byMonth[key]) byMonth[key] = { count: 0, debit: 0, credit: 0 };
        byMonth[key].count++;
        if (t.type === 'DEBIT')  byMonth[key].debit  += Math.abs(t.amount);
        if (t.type === 'CREDIT') byMonth[key].credit += Math.abs(t.amount);
    }

    // ── DTEs 2026 ──────────────────────────────────────────────────────────
    const dtes = await p.dTE.findMany({
        where: { issuedDate: { gte: from2026 }, organizationId: orgId },
        select: { id: true, totalAmount: true, issuedDate: true, type: true, paymentStatus: true }
    });
    const dteByStatus: Record<string, { count: number; sum: number }> = {};
    for (const d of dtes) {
        const s = d.paymentStatus;
        if (!dteByStatus[s]) dteByStatus[s] = { count: 0, sum: 0 };
        dteByStatus[s].count++;
        dteByStatus[s].sum += Math.abs(d.totalAmount);
    }

    // ── Matches 2026 ───────────────────────────────────────────────────────
    const matches = await p.reconciliationMatch.findMany({
        where: { createdAt: { gte: from2026 }, organizationId: orgId },
        select: { status: true, confidence: true, ruleApplied: true }
    });
    const matchByStatus: Record<string, number> = {};
    const matchByRule: Record<string, number> = {};
    for (const m of matches) {
        matchByStatus[m.status] = (matchByStatus[m.status] || 0) + 1;
        const rule = m.ruleApplied?.match(/\[P\d[^\]]*\]/)?.[0] || m.ruleApplied?.slice(0,15) || 'Manual';
        matchByRule[rule] = (matchByRule[rule] || 0) + 1;
    }

    // ── Sugerencias SUM/SPLIT ──────────────────────────────────────────────
    const suggestions = await p.matchSuggestion.groupBy({
        by: ['status', 'type'],
        where: { organizationId: orgId },
        _count: true
    });

    // ── IMPRIMIR RESUMEN ───────────────────────────────────────────────────
    const fmt = (n: number) => `$${n.toLocaleString('es-CL')}`;

    console.log(`\n${'═'.repeat(62)}`);
    console.log(`  RESUMEN BRAVIUM 2026 — hasta ${lastTxDate?.toISOString().slice(0,10)}`);
    console.log(`${'═'.repeat(62)}\n`);

    console.log(`📅 PERÍODO: ${firstTxDate?.toISOString().slice(0,10)} → ${lastTxDate?.toISOString().slice(0,10)}`);
    console.log(`\n${'─'.repeat(62)}`);
    console.log(`  MOVIMIENTOS BANCARIOS 2026`);
    console.log(`${'─'.repeat(62)}`);
    console.log(`  Total movimientos:   ${txs.length}`);
    console.log(`  Total egresos:       ${txDebit.length}  ${fmt(txDebit.reduce((s,t) => s+Math.abs(t.amount),0))}`);
    console.log(`  Total ingresos:      ${txCredit.length}  ${fmt(txCredit.reduce((s,t) => s+Math.abs(t.amount),0))}`);
    console.log(`\n  Por mes (egresos / ingresos):`);
    for (const [mes, d] of Object.entries(byMonth).sort()) {
        console.log(`    ${mes}:  -${fmt(d.debit).padStart(18)}  +${fmt(d.credit).padStart(18)}  (${d.count} mov)`);
    }
    console.log(`\n  Estado de egresos:`);
    for (const [s, d] of Object.entries(byStatus).sort()) {
        console.log(`    ${s.padEnd(18)}: ${String(d.count).padStart(4)} TXs  ${fmt(d.sum).padStart(18)}`);
    }

    console.log(`\n${'─'.repeat(62)}`);
    console.log(`  DOCUMENTOS TRIBUTARIOS (DTEs) 2026`);
    console.log(`${'─'.repeat(62)}`);
    console.log(`  Total DTEs:  ${dtes.length}`);
    for (const [s, d] of Object.entries(dteByStatus).sort()) {
        console.log(`    ${s.padEnd(10)}: ${String(d.count).padStart(4)} DTEs  ${fmt(d.sum).padStart(18)}`);
    }

    console.log(`\n${'─'.repeat(62)}`);
    console.log(`  CONCILIACIÓN 2026`);
    console.log(`${'─'.repeat(62)}`);
    console.log(`  Matches:`);
    for (const [s, c] of Object.entries(matchByStatus)) {
        console.log(`    ${s.padEnd(16)}: ${c}`);
    }
    console.log(`\n  Por tipo de regla:`);
    for (const [r, c] of Object.entries(matchByRule).sort((a,b) => b[1]-a[1])) {
        console.log(`    ${r.padEnd(20)}: ${c}`);
    }
    console.log(`\n  Sugerencias SUM/SPLIT:`);
    for (const s of suggestions) {
        console.log(`    ${s.type} ${s.status.padEnd(10)}: ${s._count}`);
    }

    // Tasa de conciliación
    const confirmed = matchByStatus['CONFIRMED'] || 0;
    const draft = matchByStatus['DRAFT'] || 0;
    const totalDebit2026 = txDebit.length;
    const matched2026 = txDebit.filter(t => t.status === 'MATCHED').length;
    const partial2026 = txDebit.filter(t => t.status === 'PARTIALLY_MATCHED').length;
    const unmatched2026 = txDebit.filter(t => t.status === 'UNMATCHED').length;
    const pending2026 = txDebit.filter(t => t.status === 'PENDING').length;

    console.log(`\n${'─'.repeat(62)}`);
    console.log(`  TASA DE CONCILIACIÓN 2026`);
    console.log(`${'─'.repeat(62)}`);
    console.log(`  MATCHED (confirmado):    ${matched2026}  (${Math.round(matched2026/totalDebit2026*100)}%)`);
    console.log(`  PARTIALLY_MATCHED (DRAFT): ${partial2026}  (${Math.round(partial2026/totalDebit2026*100)}%)`);
    console.log(`  UNMATCHED (revisado/cerrado): ${unmatched2026}  (${Math.round(unmatched2026/totalDebit2026*100)}%)`);
    console.log(`  PENDING (sin revisar):   ${pending2026}  (${Math.round(pending2026/totalDebit2026*100)}%)`);
    console.log(`\n  ✅ Tasa cerrada (MATCHED+UNMATCHED): ${Math.round((matched2026+unmatched2026)/totalDebit2026*100)}%`);
    console.log(`  📋 Requieren acción:     ${pending2026 + partial2026} TXs`);
    console.log(`${'═'.repeat(62)}\n`);
}

main().catch(console.error).finally(() => p.$disconnect());
