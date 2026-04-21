import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const twentyMinsAgo = new Date(Date.now() - 20 * 60000);
    
    // Contamos cuantos hay creados en los ultimos 20 mins
    const count = await prisma.bankTransaction.count({
        where: {
            createdAt: { gte: twentyMinsAgo },
            origin: 'API_INTEGRATION'
        }
    });
    
    console.log(`Transacciones creadas en los últimos 20 min: ${count}`);
    
    if (count > 0) {
        console.log("Eliminando duplicados creados por el script...");
        const deleted = await prisma.bankTransaction.deleteMany({
            where: {
                createdAt: { gte: twentyMinsAgo },
                origin: 'API_INTEGRATION'
            }
        });
        console.log(`Se han eliminado ${deleted.count} transacciones duplicadas.`);
    }

    await prisma.$disconnect();
}
main().catch(console.error);
