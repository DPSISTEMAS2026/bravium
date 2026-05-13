import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const ORG = '715545b8-4522-4bb1-be81-3047546c0e8c';
const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);

async function main() {
    // Find the 2 x $15M transfers from March 25 to LATAM
    const tx15m = await p.bankTransaction.findMany({
        where: {
            bankAccount: { organizationId: ORG },
            date: { gte: new Date('2026-03-20'), lte: new Date('2026-03-31') },
            amount: { lte: -14000000, gte: -16000000 },
        },
        orderBy: { date: 'asc' },
    });
    
    console.log('TX ~$15M en marzo 20-31:');
    for (const t of tx15m) {
        const matches = await p.reconciliationMatch.findMany({ where: { transactionId: t.id } });
        console.log(`  ${t.id} | ${t.date?.toISOString().slice(0,10)} | ${fmt(t.amount)} | status: ${t.status} | ${t.description} | matches: ${matches.length}`);
    }
    
    // Find the LATAM DTE 5419109
    const dte = await p.dTE.findFirst({ where: { folio: 5419109, provider: { organizationId: ORG } } });
    if (dte) {
        console.log(`\nDTE 5419109: total=${fmt(dte.totalAmount)} outstanding=${fmt(dte.outstandingAmount)} status=${dte.paymentStatus}`);
        console.log(`  → Falta por pagar: ${fmt(dte.outstandingAmount)}`);
        console.log(`  → Ya pagado (via match CONFIRMED $5.764.013): ${fmt(dte.totalAmount - dte.outstandingAmount)}`);
        console.log(`  → Pero outstanding sigue en $35.764.013 — el match CONFIRMED no redujo el outstanding!`);
    }
}
main().catch(console.error).finally(() => p.$disconnect());
