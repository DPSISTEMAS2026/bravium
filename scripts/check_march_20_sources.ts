import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const txs = await prisma.bankTransaction.findMany({
        where: {
            date: {
                gte: new Date('2026-03-20'),
                lte: new Date('2026-03-20')
            }
        }
    });

    const sources = txs.map(t => (t.metadata as any)?.sourceFile);
    console.log('Sources for March 20 transactions:', Array.from(new Set(sources)));
}

main().catch(console.error).finally(() => prisma.$disconnect());
