import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Recalculando Provider.currentBalance basado en outstandingAmount de sus DTEs...');
    
    const providers = await prisma.provider.findMany();
    
    for (const p of providers) {
        const agg = await prisma.dTE.aggregate({
            where: {
                providerId: p.id,
                paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
                type: { not: 61 } // Excluimos abonos
            },
            _sum: { outstandingAmount: true }
        });
        
        const realDebt = agg._sum.outstandingAmount || 0;
        
        if (p.currentBalance !== realDebt) {
            console.log(`Corrigiendo ${p.name}: ${p.currentBalance} -> ${realDebt}`);
            await prisma.provider.update({
                where: { id: p.id },
                data: { currentBalance: realDebt }
            });
        }
    }
    
    console.log('¡Sincronización completa!');
}

main().finally(() => setTimeout(() => process.exit(0), 10));
