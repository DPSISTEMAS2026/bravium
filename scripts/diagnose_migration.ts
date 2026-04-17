import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const braviumAccId = 'acc-santander-9219882-0';
    const dpOrgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d';

    // 1. Rango de fechas de las cartolas manuales en Bravium
    const braviumTxs = await prisma.bankTransaction.findMany({
        where: { bankAccountId: braviumAccId },
        orderBy: { date: 'asc' },
        select: { id: true, date: true, amount: true, description: true, origin: true }
    });

    const firstDate = braviumTxs[0]?.date;
    const lastDate = braviumTxs[braviumTxs.length - 1]?.date;
    console.log(`=== BRAVIUM Santander CC ===`);
    console.log(`Total: ${braviumTxs.length} movimientos`);
    console.log(`Rango: ${firstDate?.toISOString().split('T')[0]} → ${lastDate?.toISOString().split('T')[0]}`);

    // 2. Cuántos tienen reconciliation matches
    const matchedTxIds = await prisma.reconciliationMatch.findMany({
        where: { transaction: { bankAccountId: braviumAccId } },
        select: { transactionId: true }
    });
    const matchedSet = new Set(matchedTxIds.map(m => m.transactionId));
    console.log(`Con Matches de Conciliación: ${matchedSet.size}`);

    // 3. Desglose por mes
    const byMonth: Record<string, { total: number, withMatch: number }> = {};
    braviumTxs.forEach(tx => {
        const month = tx.date.toISOString().substring(0, 7);
        if (!byMonth[month]) byMonth[month] = { total: 0, withMatch: 0 };
        byMonth[month].total++;
        if (matchedSet.has(tx.id)) byMonth[month].withMatch++;
    });

    console.log(`\n--- Desglose por Mes (Bravium) ---`);
    Object.entries(byMonth).sort().forEach(([month, data]) => {
        console.log(`${month}: ${data.total} movimientos, ${data.withMatch} con match`);
    });

    // 4. Rango de fechas Fintoc
    const fintocTxs = await prisma.bankTransaction.findMany({
        where: {
            origin: 'API_INTEGRATION',
            bankAccount: { organizationId: dpOrgId, bankName: { contains: 'Fintoc' } }
        },
        orderBy: { date: 'asc' },
        select: { date: true }
    });

    const fFirst = fintocTxs[0]?.date;
    const fLast = fintocTxs[fintocTxs.length - 1]?.date;
    console.log(`\n=== FINTOC (DP Sistemas) ===`);
    console.log(`Total: ${fintocTxs.length} movimientos`);
    console.log(`Rango: ${fFirst?.toISOString().split('T')[0]} → ${fLast?.toISOString().split('T')[0]}`);

    // 5. Desglose por mes Fintoc
    const fByMonth: Record<string, number> = {};
    fintocTxs.forEach(tx => {
        const month = tx.date.toISOString().substring(0, 7);
        fByMonth[month] = (fByMonth[month] || 0) + 1;
    });

    console.log(`\n--- Desglose por Mes (Fintoc) ---`);
    Object.entries(fByMonth).sort().forEach(([month, count]) => {
        console.log(`${month}: ${count} movimientos`);
    });
}

main().finally(() => prisma.$disconnect());
