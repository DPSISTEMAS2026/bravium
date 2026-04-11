import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const fn = 'CartolaProvisoria-000092198820-0066-20260324.xlsx';
    console.log(`--- Searching 419940 in RAW DATA of File: ${fn} ---`);
    
    const txs = await prisma.bankTransaction.findMany({
        where: {
            metadata: {
                path: ['sourceFile'],
                equals: fn
            }
        }
    });

    console.log(`Total transactions checked: ${txs.length}`);
    
    // Since we only store SUCCESSFUL insertions in BankTransaction, 
    // if OpenAI missed it, it won't be here.
    
    // BUT maybe it was inserted with a different amount or date?
    // Let's check for anything with 419940 in the rawRow but different processed amount.
    
    txs.forEach(t => {
        const raw = (t.metadata as any)?.rawRow;
        if (JSON.stringify(raw).includes('419940')) {
            console.log('FOUND in rawRow of Transaction ID:', t.id);
            console.log('Processed Amount:', t.amount);
            console.log('Raw Data:', JSON.stringify(raw));
        }
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
