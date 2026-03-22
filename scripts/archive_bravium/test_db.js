
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- Testing Query ---');
        const count = await prisma.bankTransaction.count();
        console.log('Count:', count);
        console.log('--- Success ---');
    } catch (e) {
        console.error('--- Failure ---', e);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
