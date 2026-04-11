import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const acc = await prisma.bankAccount.findFirst({
        where: { bankName: 'Santander', accountNumber: '0-000-9219882-0' }
    });
    
    if (!acc) {
        console.log('Account not found');
        return;
    }

    console.log(`Account: ${acc.bankName} (${acc.accountNumber})`);
    
    const latestTx = await prisma.bankTransaction.findFirst({
        where: { bankAccountId: acc.id },
        orderBy: { date: 'desc' }
    });
    
    if (latestTx) {
        console.log(`Latest Transaction Date: ${latestTx.date.toISOString()}`);
        console.log(`Latest Transaction Desc: ${latestTx.description}`);
    } else {
        console.log('No transactions found in this account.');
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
