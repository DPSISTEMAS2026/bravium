import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const total = await prisma.reconciliationMatch.count({ where: { status: 'CONFIRMED' }});
    console.log('Confirmed matches in DB:', total);
    await prisma.$disconnect();
}
main();
