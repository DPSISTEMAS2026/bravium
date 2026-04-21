import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const txs = await prisma.bankTransaction.findMany({ 
        where: { 
            OR: [ 
                { amount: 215601 }, 
                { amount: -215601 } 
            ] 
        } 
    });
    console.log(JSON.stringify(txs, null, 2));
    await prisma.$disconnect();
}
main().catch(console.error);
