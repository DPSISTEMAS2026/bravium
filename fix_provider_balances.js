const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixProviderBalances() {
    console.log('Iniciando recalculo de saldos de proveedores basado en DTEs UNPAID...');
    
    // Obtenemos todos los proveedores
    const providers = await prisma.provider.findMany({
        select: { id: true, name: true, currentBalance: true }
    });

    let fixedCount = 0;

    for (const p of providers) {
        // Calculamos la deuda real pendiente (outstandingAmount) de las facturas UNPAID o PARTIAL
        const agg = await prisma.dTE.aggregate({
            where: { 
                providerId: p.id, 
                paymentStatus: { in: ['UNPAID', 'PARTIAL'] }
            },
            _sum: { outstandingAmount: true }
        });

        const realBalance = agg._sum.outstandingAmount || 0;

        if (realBalance !== p.currentBalance) {
            console.log(`[FIX] ${p.name}: Caché ${p.currentBalance} -> Real ${realBalance}`);
            await prisma.provider.update({
                where: { id: p.id },
                data: { currentBalance: realBalance }
            });
            fixedCount++;
        }
    }

    console.log(`\nProceso completado. ${fixedCount} proveedores actualizados.`);
}

fixProviderBalances()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
