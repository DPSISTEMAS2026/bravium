import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const ORG = '715545b8-4522-4bb1-be81-3047546c0e8c';
const Y_START = new Date('2026-01-01');
const Y_END = new Date('2027-01-01');
const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);

async function main() {
    // ═══ KPI 1: 191 Pagos pendientes - $187.887.025 ═══
    console.log('═══ KPI: PAGOS PENDIENTES (DTEs UNPAID) ═══\n');
    
    const unpaidDtes = await p.dTE.findMany({
        where: {
            paymentStatus: 'UNPAID',
            provider: { organizationId: ORG },
            issuedDate: { gte: Y_START, lt: Y_END },
        },
        include: { provider: { select: { name: true } } },
        orderBy: { outstandingAmount: 'desc' },
    });
    
    const totalOutstanding = unpaidDtes.reduce((s, d) => s + (d.outstandingAmount || 0), 0);
    const totalAmount = unpaidDtes.reduce((s, d) => s + d.totalAmount, 0);
    
    console.log(`Total DTEs UNPAID: ${unpaidDtes.length}`);
    console.log(`Suma outstandingAmount: ${fmt(totalOutstanding)}`);
    console.log(`Suma totalAmount: ${fmt(totalAmount)}`);
    
    // Check if any have outstandingAmount != totalAmount (partially paid but still UNPAID?)
    const partiallyPaid = unpaidDtes.filter(d => d.outstandingAmount !== d.totalAmount);
    if (partiallyPaid.length > 0) {
        console.log(`\n⚠️  ${partiallyPaid.length} DTEs UNPAID con outstanding != total:`);
        partiallyPaid.forEach(d => {
            console.log(`   Folio ${d.folio}: total=${fmt(d.totalAmount)} outstanding=${fmt(d.outstandingAmount)} diff=${fmt(d.totalAmount - d.outstandingAmount)} [${d.provider?.name}]`);
        });
    }
    
    // Top 10
    console.log('\nTop 10 por outstanding:');
    unpaidDtes.slice(0, 10).forEach(d => {
        console.log(`  Folio ${d.folio} | ${fmt(d.outstandingAmount)} | ${d.provider?.name} | ${d.issuedDate?.toISOString().slice(0,10)}`);
    });

    // ═══ KPI 2: 171 Sin DTE - $296.130.995 ═══
    console.log('\n═══ KPI: MOVIMIENTOS SIN DTE (TX PENDING+DEBIT) ═══\n');
    
    const sinDte = await p.bankTransaction.findMany({
        where: {
            status: 'PENDING',
            type: 'DEBIT',
            bankAccount: { organizationId: ORG },
            date: { gte: Y_START, lt: Y_END },
        },
        include: { bankAccount: true },
        orderBy: { amount: 'asc' },
    }) as any[];
    
    const totalSinDte = sinDte.reduce((s: number, t: any) => s + Math.abs(t.amount), 0);
    console.log(`Total TX PENDING+DEBIT: ${sinDte.length}`);
    console.log(`Suma |amount|: ${fmt(totalSinDte)}`);
    
    // By bank account
    const byAccount: Record<string, { count: number; total: number }> = {};
    for (const t of sinDte as any[]) {
        const key = (t.bankAccount?.name || t.bankAccount?.bankName || 'Unknown') as string;
        if (!byAccount[key]) byAccount[key] = { count: 0, total: 0 };
        byAccount[key].count++;
        byAccount[key].total += Math.abs(t.amount);
    }
    console.log('\nDesglose por cuenta bancaria:');
    Object.entries(byAccount).sort((a, b) => b[1].total - a[1].total).forEach(([name, data]) => {
        console.log(`  ${name}: ${data.count} tx → ${fmt(data.total)}`);
    });
    
    // Check for any that have manualReview set (already reviewed but still PENDING)
    const reviewed = sinDte.filter(t => (t as any).manualReviewStatus === 'REVIEWED');
    console.log(`\nYa revisadas manualmente: ${reviewed.length}`);
    
    // Top 10
    console.log('\nTop 10 por monto (más grandes):');
    (sinDte as any[]).slice(0, 10).forEach((t: any) => {
        console.log(`  ${t.date?.toISOString().slice(0,10)} | ${fmt(t.amount)} | ${t.description?.substring(0,50)} | ${t.bankAccount?.name}`);
    });
    
    // Check if some of these have matches (shouldn't be PENDING if they do)
    const pendingWithMatches = await p.bankTransaction.findMany({
        where: {
            status: 'PENDING',
            type: 'DEBIT',
            bankAccount: { organizationId: ORG },
            date: { gte: Y_START, lt: Y_END },
            matches: { some: {} },
        },
        select: { id: true, description: true, amount: true },
    });
    console.log(`\n⚠️  TX PENDING pero CON matches asociados: ${pendingWithMatches.length}`);
    if (pendingWithMatches.length > 0) {
        pendingWithMatches.slice(0, 5).forEach(t => {
            console.log(`   ${fmt(t.amount)} | ${t.description?.substring(0,50)}`);
        });
    }
}
main().catch(console.error).finally(() => p.$disconnect());
