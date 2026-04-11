import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const txs = await prisma.bankTransaction.findMany({
        select: { metadata: true }
    });
    
    const files = new Set();
    txs.forEach(t => {
        const fn = (t.metadata as any)?.sourceFile;
        if (fn) files.add(fn);
    });

    console.log('--- ALL Processed Bank Files ---');
    console.log(Array.from(files).sort());
}

main().catch(console.error).finally(() => prisma.$disconnect());
