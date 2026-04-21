import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Buscando BankTransactions recientes (Marzo a Abril) que coincidan cerca de 339959:");
    const txs = await prisma.bankTransaction.findMany({
        where: {
            OR: [
                { amount: { gte: 339000, lte: 340000 } },
                { amount: { gte: -340000, lte: -339000 } }
            ]
        }
    });
    console.log(txs);

    await prisma.$disconnect();
}
main().catch(console.error);
