import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const txSearch = '288.960';
    console.log(`Searching for: ${txSearch}`);
    const searchNumber = parseInt(txSearch.replace(/\D/g, ''), 10);
    console.log(`Numeric search: ${searchNumber}`);
    
    // Simulate what the backend does
    const txs = await prisma.bankTransaction.findMany({
        where: {
            OR: [
                { description: { contains: txSearch, mode: 'insensitive' } },
                { reference: { contains: txSearch, mode: 'insensitive' } },
                !isNaN(searchNumber) ? { amount: { equals: searchNumber } } : {},
                !isNaN(searchNumber) ? { amount: { equals: -searchNumber } } : {}
            ]
        }
    });
    console.log(`Found: ${txs.length}`);
    await prisma.$disconnect();
}
main();
