
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const total = await prisma.bankTransaction.count();
    const byOrigin = await prisma.bankTransaction.groupBy({
        by: ['origin'],
        _count: true
    });
    const last5 = await prisma.bankTransaction.findMany({
        take: 5,
        orderBy: { date: 'desc' },
        select: {
            date: true,
            amount: true,
            description: true,
            origin: true
        }
    });

    console.log('Total Transactions:', total);
    console.log('By Origin:', JSON.stringify(byOrigin, null, 2));
    console.log('Last 5:', JSON.stringify(last5, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
