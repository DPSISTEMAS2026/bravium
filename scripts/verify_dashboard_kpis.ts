import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const ORG = '715545b8-4522-4bb1-be81-3047546c0e8c';

async function main() {
    const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);
    const Y_START = new Date('2026-01-01');
    const Y_END = new Date('2027-01-01');

    // What the dashboard currently shows for each KPI
    console.log('═══ VERIFICACIÓN DE KPIs DEL DASHBOARD ═══\n');
    
    // 1. Matches por revisar (DRAFT)
    const drafts = await p.reconciliationMatch.findMany({
        where: { status: 'DRAFT', transaction: { bankAccount: { organizationId: ORG }, date: { gte: Y_START, lt: Y_END } } },
        select: { transaction: { select: { amount: true } } }
    });
    const draftTotal = drafts.reduce((s, m) => s + Math.abs(m.transaction?.amount || 0), 0);
    console.log(`1. Matches por revisar: ${drafts.length} → ${fmt(draftTotal)}`);
    
    // 2. Pagos pendientes (DTEs UNPAID)
    const unpaidAgg = await p.dTE.aggregate({
        where: { paymentStatus: 'UNPAID', provider: { organizationId: ORG }, issuedDate: { gte: Y_START, lt: Y_END } },
        _count: true, _sum: { outstandingAmount: true }
    });
    const unpaidProvs = await p.dTE.findMany({
        where: { paymentStatus: 'UNPAID', provider: { organizationId: ORG }, issuedDate: { gte: Y_START, lt: Y_END } },
        select: { providerId: true }, distinct: ['providerId']
    });
    console.log(`2. Pagos pendientes: ${unpaidAgg._count} DTEs → ${fmt(unpaidAgg._sum.outstandingAmount || 0)} (${unpaidProvs.length} proveedores)`);
    
    // 3. Movimientos sin DTE (PENDING + DEBIT only)
    const sinDteAgg = await p.bankTransaction.aggregate({
        where: { status: 'PENDING', type: 'DEBIT', bankAccount: { organizationId: ORG }, date: { gte: Y_START, lt: Y_END } },
        _count: true, _sum: { amount: true }
    });
    console.log(`3. Sin DTE (PENDING+DEBIT): ${sinDteAgg._count} → ${fmt(Math.abs(sinDteAgg._sum.amount || 0))}`);
    
    // Also check UNMATCHED DEBIT for completeness
    const unmatchedDebitAgg = await p.bankTransaction.aggregate({
        where: { status: 'UNMATCHED', type: 'DEBIT', bankAccount: { organizationId: ORG }, date: { gte: Y_START, lt: Y_END } },
        _count: true, _sum: { amount: true }
    });
    console.log(`   + UNMATCHED DEBIT: ${unmatchedDebitAgg._count} → ${fmt(Math.abs(unmatchedDebitAgg._sum.amount || 0))}`);
    
    // 4. TX Summary (what the stats grid shows)
    const txTotal = await p.bankTransaction.count({
        where: { bankAccount: { organizationId: ORG }, date: { gte: Y_START, lt: Y_END } }
    });
    const txMatched = await p.bankTransaction.count({
        where: { bankAccount: { organizationId: ORG }, date: { gte: Y_START, lt: Y_END }, status: { in: ['MATCHED', 'PARTIALLY_MATCHED'] } }
    });
    console.log(`\n4. Transacciones 2026: ${txTotal} total, ${txMatched} matched = ${((txMatched/txTotal)*100).toFixed(1)}%`);
    
    // 5. DTEs summary
    const dteTotal = await p.dTE.count({
        where: { organizationId: ORG, issuedDate: { gte: Y_START, lt: Y_END }, type: { not: 61 } }
    });
    const dtePaid = await p.dTE.count({
        where: { organizationId: ORG, issuedDate: { gte: Y_START, lt: Y_END }, type: { not: 61 }, paymentStatus: 'PAID' }
    });
    const dteUnpaid = await p.dTE.count({
        where: { organizationId: ORG, issuedDate: { gte: Y_START, lt: Y_END }, type: { not: 61 }, paymentStatus: 'UNPAID' }
    });
    console.log(`5. DTEs 2026 (excl NC): ${dteTotal} total, ${dtePaid} paid, ${dteUnpaid} unpaid`);
    
    // 6. Provider stats
    const provTotal = await p.provider.count({ where: { organizationId: ORG } });
    const provDeuda = await p.provider.count({ where: { organizationId: ORG, currentBalance: { gt: 0 } } });
    const provDeudaSum = await p.provider.aggregate({ where: { organizationId: ORG, currentBalance: { gt: 0 } }, _sum: { currentBalance: true } });
    console.log(`6. Proveedores: ${provTotal} total, ${provDeuda} con deuda = ${fmt(provDeudaSum._sum.currentBalance || 0)}`);
    
    console.log('\n═══ FIN ═══');
}
main().catch(console.error).finally(() => p.$disconnect());
