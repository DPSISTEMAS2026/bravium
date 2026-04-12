import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const orgId = '715545b8-4522-4bb1-be81-3047546c0e8c'; // Bravium SpA
    
    // Exact dashboard logic for bank transactions
    const txFilter: any = {};
    txFilter.bankAccount = { organizationId: orgId };
    txFilter.type = 'DEBIT'; // Most dashboard stats focus on debits or summaries

    const txCount = await prisma.bankTransaction.count({ where: txFilter });
    console.log("BANK TRANSACTIONS COUNT FOR BRAVIUM:", txCount);

    const accounts = await prisma.bankAccount.findMany({ where: { organizationId: orgId } });
    console.log("BANK ACCOUNTS COUNT:", accounts.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
