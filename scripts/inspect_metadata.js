
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const txs = await prisma.bankTransaction.findMany({
        select: {
            id: true,
            description: true,
            metadata: true
        }
    });
    console.log(JSON.stringify(txs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
