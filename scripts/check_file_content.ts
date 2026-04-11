import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const fn = 'CartolaProvisoria-000092198820-0066-20260324.xlsx';
    console.log(`--- Checking File: ${fn} ---`);
    
    // Prisma query for metadata with sourceFile
    const txs = await prisma.bankTransaction.findMany({
        where: {
            metadata: {
                path: ['sourceFile'],
                equals: fn
            }
        },
        orderBy: { date: 'asc' }
    });

    console.log(`Total transactions from this file: ${txs.length}`);
    if (txs.length > 0) {
        console.log(`Date range: ${txs[0].date.toISOString()} to ${txs[txs.length-1].date.toISOString()}`);
        console.log('\nSample transations:');
        txs.slice(0, 5).forEach(t => {
            console.log(`[${t.date.toISOString()}] $${t.amount} | ${t.description}`);
        });
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
