import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Buscando DTE folio 15005:");
    const dte = await prisma.dTE.findMany({ where: { folio: 15005 }, include: { provider: true } });
    console.log(dte);

    console.log("\nBuscando BankTransactions por monto 339959:");
    const txs = await prisma.bankTransaction.findMany({ where: { amount: { in: [339959, -339959] } } });
    console.log(txs);

    await prisma.$disconnect();
}

main().catch(console.error);
