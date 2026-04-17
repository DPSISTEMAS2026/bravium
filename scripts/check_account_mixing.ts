import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const dpOrgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d';

    // LADO FINTOC: ¿Cuántas cuentas bancarias Fintoc hay y cuántas txs cada una?
    const fintocAccounts = await prisma.bankAccount.findMany({
        where: { organizationId: dpOrgId, bankName: { contains: 'Fintoc' } },
        include: { _count: { select: { transactions: true } } }
    });

    console.log("=== FINTOC: Cuentas en DP Sistemas ===");
    fintocAccounts.forEach(a => {
        console.log(`- ${a.bankName} | Nº ${a.accountNumber} | ${a._count.transactions} txs`);
    });

    // Verificar metadata de las transacciones para confirmar qué cuenta Fintoc las generó
    const fintocTxSample = await prisma.bankTransaction.findMany({
        where: { 
            origin: 'API_INTEGRATION',
            bankAccount: { organizationId: dpOrgId, bankName: { contains: 'Fintoc' } }
        },
        select: { metadata: true },
        take: 5
    });

    const fintocAccountIds = new Set<string>();
    const allFintocTxs = await prisma.bankTransaction.findMany({
        where: { 
            origin: 'API_INTEGRATION',
            bankAccount: { organizationId: dpOrgId, bankName: { contains: 'Fintoc' } }
        },
        select: { metadata: true }
    });
    allFintocTxs.forEach(tx => {
        const accId = (tx.metadata as any)?.fintocAccount;
        if (accId) fintocAccountIds.add(accId);
    });

    console.log(`\nCuentas Fintoc únicas en metadata: ${[...fintocAccountIds].join(', ')}`);

    // LADO BRAVIUM: Verificar si la CC tiene mezcla con TC
    console.log("\n=== BRAVIUM: Cuenta Santander CC ===");
    const ccTxs = await prisma.bankTransaction.findMany({
        where: { bankAccountId: 'acc-santander-9219882-0' },
        select: { description: true, amount: true, date: true, origin: true }
    });

    // Buscar patrones sospechosos de TC en la CC
    const tcPatterns = ccTxs.filter(tx => {
        const desc = (tx.description || '').toLowerCase();
        return desc.includes('tarjeta') || desc.includes('visa') || desc.includes('mastercard') 
            || desc.includes('5239') || desc.includes('cuota');
    });

    console.log(`Total txs en CC: ${ccTxs.length}`);
    console.log(`Con patrones sospechosos de TC: ${tcPatterns.length}`);
    if (tcPatterns.length > 0) {
        console.log("Ejemplos:");
        tcPatterns.slice(0, 5).forEach(tx => {
            console.log(`  ${tx.date.toISOString().split('T')[0]} | $${tx.amount} | ${tx.description}`);
        });
    }

    // Orígenes distintos en CC
    const origins = new Map<string, number>();
    ccTxs.forEach(tx => {
        origins.set(tx.origin, (origins.get(tx.origin) || 0) + 1);
    });
    console.log("\nOrígenes de datos en CC:");
    origins.forEach((count, origin) => console.log(`  ${origin}: ${count}`));
}

main().finally(() => prisma.$disconnect());
