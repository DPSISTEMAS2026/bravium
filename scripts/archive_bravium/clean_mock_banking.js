
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🗑️ Limpiando datos mock de transacciones...');
    const deletedMatches = await prisma.reconciliationMatch.deleteMany({});
    const deletedTxs = await prisma.bankTransaction.deleteMany({});
    const deletedAccounts = await prisma.bankAccount.deleteMany({});

    console.log(`✅ Eliminados: ${deletedMatches.count} matches, ${deletedTxs.count} transacciones, ${deletedAccounts.count} cuentas.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
