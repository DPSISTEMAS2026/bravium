import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Buscando VICTORINOX o Montos cercanos a 419940 ---');
    
    const transactions = await prisma.bankTransaction.findMany({
        where: {
            OR: [
                { description: { contains: 'VICTORINOX', mode: 'insensitive' } },
                { description: { contains: 'VICTORI', mode: 'insensitive' } },
                { amount: { gte: 400000, lte: 430000 } },
                { amount: { gte: -430000, lte: -400000 } }
            ]
        },
        include: { bankAccount: true }
    });

    transactions.forEach(tx => {
        console.log(`[${tx.date.toISOString()}] ${tx.bankAccount.bankName} | ${tx.description} | $${tx.amount} | Status: ${tx.status}`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
