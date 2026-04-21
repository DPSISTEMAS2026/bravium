import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const pendingTotal = await prisma.bankTransaction.count({
        where: { status: 'PENDING' }
    });
    console.log('Transacciones bancarias PENDING totales:', pendingTotal);
    
    // Veamos cuantos DTEs pendientes
    const pendingDTEs = await prisma.dTE.count({
        where: { paymentStatus: 'UNPAID' }
    });
    console.log('DTEs UNPAID totales:', pendingDTEs);

    await prisma.$disconnect();
}
main().catch(console.error);
