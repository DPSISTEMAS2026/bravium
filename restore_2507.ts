import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    await prisma.dTE.update({
        where: { id: '4ab0b7c1-b95b-404b-8898-b4f0105a4050' },
        data: { paymentStatus: 'UNPAID', outstandingAmount: 79992 }
    });
    console.log('Restaurado a UNPAID para permitir su conciliación y suma.');
    await prisma.$disconnect();
}
main();
