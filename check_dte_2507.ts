import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const dtes = await prisma.dTE.findMany({
        where: {
            folio: 2507,
        },
        include: { provider: true }
    });

    console.log(`Found ${dtes.length} DTEs with folio 2507`);
    dtes.forEach(d => {
        console.log(`DTE ${d.folio} [ID: ${d.id}] - Provider: ${d.provider?.name} - Status: ${d.paymentStatus} - Total: $${d.totalAmount} - Fecha: ${d.issuedDate}`);
    });

    const dtesCercano = await prisma.dTE.findMany({
        where: { provider: { name: { contains: 'CERCANO' } } },
        include: { provider: true }
    });
    console.log(`Found ${dtesCercano.length} DTEs from CERCANO S.A.`);

    await prisma.$disconnect();
}
main();
