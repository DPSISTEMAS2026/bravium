import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Buscando sugerencias huérfanas o erróneas ligadas a ABONOS (CREDITS)...');
    
    // Obtener transacciones tipo ABONO que tienen sugerencias
    const creditsWithSuggestions = await prisma.bankTransaction.findMany({
        where: { type: 'CREDIT' },
        select: { id: true, amount: true }
    });

    const creditIds = creditsWithSuggestions.map(c => c.id);

    // Buscar sugerencias pendientes que involucren alguno de estos ABONOS
    const suggestionsToPurge = await prisma.matchSuggestion.findMany({
        where: {
            status: 'PENDING',
        }
    });

    let purgeCount = 0;
    for (const sug of suggestionsToPurge) {
        let isLinkedToCredit = false;
        if (sug.transactionIds && Array.isArray(sug.transactionIds)) {
            for (const tId of sug.transactionIds as string[]) {
                if (creditIds.includes(tId)) {
                    isLinkedToCredit = true;
                    break;
                }
            }
        } else if ((sug as any).transactionId) {
            if (creditIds.includes((sug as any).transactionId)) {
                isLinkedToCredit = true;
            }
        }

        if (isLinkedToCredit) {
            await prisma.matchSuggestion.delete({ where: { id: sug.id } });
            purgeCount++;
        }
    }

    console.log(`🧹 LISTO! Limpiadas ${purgeCount} sugerencias erróneas previas asociadas a ABONOS.`);
    await prisma.$disconnect();
}

main().catch(console.error);
