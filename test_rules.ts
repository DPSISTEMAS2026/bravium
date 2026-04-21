import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    try {
        const txs = await prisma.bankTransaction.findMany({
            where: {
                description: {
                    contains: 'pago en linea',
                    mode: 'insensitive'
                }
            },
            select: {
                id: true,
                description: true,
                status: true,
                metadata: true
            }
        });
        console.log(`Found ${txs.length} total txs with 'pago en linea'`);
        txs.slice(0, 5).forEach(tx => console.log(tx.description, tx.status));
        
        const txs2 = await prisma.bankTransaction.findMany({
            where: {
                description: {
                    contains: 's.i.i',
                    mode: 'insensitive'
                }
            },
            select: {
                id: true,
                description: true,
                status: true,
                metadata: true
            }
        });
        console.log(`Found ${txs2.length} total txs with 's.i.i'`);
        txs2.slice(0, 5).forEach(tx => console.log(tx.description, tx.status));

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

run();
