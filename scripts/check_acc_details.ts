import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const accId = 'acc-santander-9219882-0';
    console.log(`--- Checking Account: ${accId} ---`);
    
    const latestTx = await prisma.bankTransaction.findFirst({
        where: { bankAccountId: accId },
        orderBy: { date: 'desc' }
    });
    
    if (latestTx) {
        console.log(`Latest Transaction Date: ${latestTx.date.toISOString()}`);
        console.log(`Latest Transaction Desc: ${latestTx.description}`);
        console.log(`Latest Transaction Amount: ${latestTx.amount}`);
    } else {
        console.log('No transactions found for this account ID.');
    }

    const count = await prisma.bankTransaction.count({ where: { bankAccountId: accId } });
    console.log(`Total transactions in this account: ${count}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
