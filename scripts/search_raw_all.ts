import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log(`--- Searching 419940 in ALL RAW DATA ---`);
    
    const txs = await prisma.bankTransaction.findMany();

    console.log(`Total transactions checked: ${txs.length}`);
    
    let found = 0;
    txs.forEach(t => {
        const raw = JSON.stringify(t.metadata);
        if (raw.includes('419940')) {
            console.log('\nFOUND in Transaction ID:', t.id);
            console.log('Date:', t.date.toISOString());
            console.log('Amount:', t.amount);
            console.log('Processed Description:', t.description);
            console.log('File:', (t.metadata as any)?.sourceFile);
            console.log('Raw Data:', raw);
            found++;
        }
    });
    
    if (found === 0) console.log('No matches found in any raw metadata.');
    else console.log(`\nTotal found: ${found}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
