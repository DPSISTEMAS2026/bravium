import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
    const org = await p.organization.findFirst({ where: { isActive: true } });
    const orgId = org!.id;
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 120);

    // ── TXs disponibles para el motor ──────────────────────────────────────
    const pendingTxs = await p.bankTransaction.findMany({
        where: {
            status: { in: ['PENDING', 'PARTIALLY_MATCHED'] },
            type: 'DEBIT',
            date: { gte: lookbackDate },
            bankAccount: { organizationId: orgId },
        },
        select: { id: true, amount: true, status: true, date: true, description: true }
    });

    const allPendingTxs = await p.bankTransaction.findMany({
        where: {
            status: { in: ['PENDING', 'PARTIALLY_MATCHED'] },
            type: 'DEBIT',
            bankAccount: { organizationId: orgId },
        },
        select: { id: true, amount: true, status: true, date: true }
    });

    console.log(`TXs DEBIT PENDING dentro de 120d: ${pendingTxs.length}`);
    console.log(`TXs DEBIT PENDING totales (sin límite fecha): ${allPendingTxs.length}`);

    // TXs fuera del lookback
    const outOfWindow = allPendingTxs.filter(t => !pendingTxs.find(p2 => p2.id === t.id));
    if (outOfWindow.length > 0) {
        console.log(`\n⚠️  TXs FUERA de la ventana de 120d (no procesadas):`);
        for (const t of outOfWindow) {
            console.log(`  $${Math.abs(t.amount).toLocaleString('es-CL')} | ${t.status} | ${t.date.toISOString().slice(0,10)}`);
        }
    }

    // ── DTEs disponibles ───────────────────────────────────────────────────
    const unpaidDtes = await p.dTE.findMany({
        where: { paymentStatus: { in: ['UNPAID', 'PARTIAL'] }, organizationId: orgId, type: { not: 61 } },
        select: { id: true, totalAmount: true, paymentStatus: true, issuedDate: true, type: true, providerId: true, provider: { select: { name: true } } }
    });

    const allUnpaidDtes = await p.dTE.findMany({
        where: { paymentStatus: { in: ['UNPAID', 'PARTIAL'] }, type: { not: 61 } },
        select: { id: true, totalAmount: true, organizationId: true, issuedDate: true, type: true }
    });

    console.log(`\nDTEs UNPAID/PARTIAL con orgId: ${unpaidDtes.length}`);
    console.log(`DTEs UNPAID/PARTIAL totales (sin org filter): ${allUnpaidDtes.length}`);

    const noOrg = allUnpaidDtes.filter(d => !d.organizationId);
    console.log(`DTEs sin organizationId: ${noOrg.length}`);

    // Distribución de montos de DTEs pendientes
    console.log('\nDTEs pendientes (últimos 20):');
    for (const d of unpaidDtes.slice(0, 20)) {
        console.log(`  Tipo ${d.type} | $${Math.abs(d.totalAmount).toLocaleString('es-CL')} | ${d.paymentStatus} | ${d.issuedDate.toISOString().slice(0,10)} | ${d.provider?.name || 'sin proveedor'}`);
    }

    // ── Resumen de estados ─────────────────────────────────────────────────
    const stats = await p.bankTransaction.groupBy({
        by: ['status'],
        where: { bankAccount: { organizationId: orgId }, type: 'DEBIT' },
        _count: true,
    });
    console.log('\nEstados de TXs DEBIT:');
    for (const s of stats) console.log(`  ${s.status}: ${s._count}`);

    const matchStats = await p.reconciliationMatch.groupBy({
        by: ['status'],
        where: { organizationId: orgId },
        _count: true,
    });
    console.log('\nEstados de Matches:');
    for (const s of matchStats) console.log(`  ${s.status}: ${s._count}`);

    // ── ¿Cuántas TXs tienen monto que coincide con algún DTE? ─────────────
    const dteAmounts = new Set(unpaidDtes.map(d => d.totalAmount));
    const txWithDteMatch = pendingTxs.filter(t => dteAmounts.has(Math.abs(t.amount)));
    console.log(`\nTXs con monto exacto que coincide con algún DTE pendiente: ${txWithDteMatch.length}`);

    // ── TXs sin match por fecha (dentro de 120d pero DTE fuera de 90d window) ──
    let blockedByDate = 0;
    for (const tx of pendingTxs) {
        const candidates = unpaidDtes.filter(d => d.totalAmount === Math.abs(tx.amount));
        if (candidates.length === 0) continue;
        const withinWindow = candidates.filter(d => Math.abs(new Date(tx.date).getTime() - new Date(d.issuedDate).getTime()) / 86400000 <= 90);
        if (withinWindow.length === 0) blockedByDate++;
    }
    console.log(`TXs bloqueadas por ventana fecha 90d (DTE existe pero muy antiguo): ${blockedByDate}`);
}
main().catch(console.error).finally(() => p.$disconnect());
