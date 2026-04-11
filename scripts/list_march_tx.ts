import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const march18 = new Date('2026-03-18');
    const march23 = new Date('2026-03-23');
    
    console.log(`--- Bank Movement Review (March 18-23) ---`);
    const txs = await prisma.bankTransaction.findMany({
        where: {
            date: {
                gte: march18,
                lte: march23
            }
        },
        include: { bankAccount: true },
        orderBy: { date: 'asc' }
    });

    txs.forEach(t => {
        console.log(`[${t.date.toISOString().split('T')[0]}] ${t.bankAccount.bankName} (${t.bankAccount.accountNumber}) | $${t.amount} | ${t.description} | Status: ${t.status}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
