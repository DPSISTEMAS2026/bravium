import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- PURGANDO TODOS LOS DTEs DEL 2025 (CERRANDO SU DEUDA) ---');

    console.log('Obteniendo DTEs...');
    const oldDtes = await prisma.dTE.findMany({
        where: {
            issuedDate: { lt: new Date('2026-01-01T00:00:00.000Z') },
            paymentStatus: { not: 'PAID' }
        },
        select: { id: true }
    });

    console.log(`DTEs anteriores a 2026 pendientes en la base actual: ${oldDtes.length}`);

    if (oldDtes.length === 0) {
        console.log('No hay DTEs de 2025 pendientes.');
        return;
    }

    const dteIds = oldDtes.map(d => d.id);

    console.log('Rechazando sugerencias de estos DTEs...');
    await prisma.matchSuggestion.updateMany({
        where: { dteId: { in: dteIds }, status: 'PENDING' },
        data: { status: 'REJECTED' }
    });

    console.log('Cerrando deuda de los DTEs...');
    const result = await prisma.dTE.updateMany({
        where: { id: { in: dteIds } },
        data: { paymentStatus: 'PAID', outstandingAmount: 0 }
    });

    console.log(`\n🎉 Exorcismo masivo completado. Se cerraron ${result.count} DTEs del 2025 o años anteriores para que dejen de generar sugerencias.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
