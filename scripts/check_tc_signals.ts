import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const txs = await prisma.bankTransaction.findMany({
        where: { amount: { in: [-1399960, 1399960] } }
    });
    console.log('Found 1399960:', txs.length);

    const compras = await prisma.bankTransaction.findMany({
        where: { description: { contains: 'COMPRA', mode: 'insensitive' } }
    });
    console.log('Found total COMPRA rows in DB:', compras.length);
    if(compras.length > 0) {
        console.log(compras.map(c => c.description + ' | ' + c.amount + ' | ' + c.date).slice(0, 5));
    }
}
main().finally(() => prisma.$disconnect());
