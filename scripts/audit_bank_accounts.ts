import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("--- REVISIÓN POST-PURGADO Y CUENTAS BANCARIAS ---");
    
    // 1. DTEs in Q1
    const dtes = await prisma.dTE.findMany({
        where: { issuedDate: { gte: new Date('2026-01-01'), lte: new Date('2026-03-31') } }
    });
    const dtesUnpaid = dtes.filter(d => d.paymentStatus === 'UNPAID');

    // 2. Txs in Q1
    const txs = await prisma.bankTransaction.findMany({
        where: { date: { gte: new Date('2026-01-01'), lte: new Date('2026-03-31') } },
        include: { bankAccount: true }
    });

    const txsPending = txs.filter(t => t.status === 'PENDING');

    console.log(`Facturas Pendientes Totales Q1: ${dtesUnpaid.length} de ${dtes.length}`);
    console.log(`Transacciones Sueltas Totales Q1: ${txsPending.length} de ${txs.length}`);

    // Let's breakdown the pending transactions by Bank Account
    console.log("\n--- Desglose de Transacciones Pendientes por Cuenta Bancaria ---");
    const accountGroup: Record<string, { count: number, name: string }> = {};
    const originGroup: Record<string, number> = {};

    for (const t of txsPending) {
        const key = t.bankAccount ? `${t.bankAccount.bankName} (${t.bankAccount.accountNumber})` : 'SIN CUENTA ASIGNADA';
        if (!accountGroup[key]) accountGroup[key] = { count: 0, name: key };
        accountGroup[key].count++;

        const oKey = t.origin;
        if (!originGroup[oKey]) originGroup[oKey] = 0;
        originGroup[oKey]++;
    }

    Object.values(accountGroup).forEach(a => console.log(` - ${a.name}: ${a.count} pendientes`));
    console.log("\n--- Desglose por Origen (API vs MANUAL vs LEGACY) ---");
    Object.entries(originGroup).forEach(([o, c]) => console.log(` - ${o}: ${c} pendientes`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
