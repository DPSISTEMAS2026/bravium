import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const accId = 'acc-santander-9219882-0';
    console.log(`--- Transactions on March 20 for Account: ${accId} ---`);
    
    const march20 = new Date('2026-03-20');
    const march21 = new Date('2026-03-21');
    
    const txs = await prisma.bankTransaction.findMany({
        where: { 
            bankAccountId: accId,
            date: {
                gte: march20,
                lt: march21
            }
        },
        orderBy: { date: 'asc' }
    });
    
    if (txs.length === 0) {
        console.log('No transactions found on March 20.');
    } else {
        txs.forEach(t => {
            console.log(`[${t.date.toISOString()}] $${t.amount} | ${t.description} | ID: ${t.id} | Status: ${t.status}`);
        });
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
