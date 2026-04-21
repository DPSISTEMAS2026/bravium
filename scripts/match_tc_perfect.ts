import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Iniciando Motor de Match Perfecto Rápido ---');
    
    // Traer todos los DTE no pagados
    const dtes = await prisma.dTE.findMany({
        where: { paymentStatus: { not: 'PAID' }, outstandingAmount: { gt: 0 } },
        include: { provider: true }
    });
    
    // Traer todas las Tx PENDIENTES
    const txs = await prisma.bankTransaction.findMany({
        where: { status: 'PENDING' }
    });

    let newMatches = 0;

    for (const tx of txs) {
        // En DTE los totales son positivos, pero outstanding también
        // Mis transacciones de expenses son negativas
        const absMontoTx = Math.abs(tx.amount);
        
        // Find exact matches
        // Prioritize same amount AND less than 14 days difference (TC may have high lag)
        const possibleDtes = dtes.filter(d => {
            if (d.outstandingAmount !== absMontoTx) return false;
            
            // Check date diff
            const dateDiff = Math.abs(d.issuedDate.getTime() - tx.date.getTime()) / (1000 * 60 * 60 * 24);
            return dateDiff <= 30; // Within 30 days
        });

        if (possibleDtes.length === 1) {
            const dte = possibleDtes[0];
            
            // Verificamos si no existe ya
            const existingMatch = await prisma.reconciliationMatch.findFirst({
                where: { transactionId: tx.id, dteId: dte.id }
            });
            
            if (!existingMatch) {
                await prisma.reconciliationMatch.create({
                    data: {
                        organizationId: dte.organizationId,
                        transactionId: tx.id,
                        dteId: dte.id,
                        status: 'CONFIRMED',
                        confidence: 1.0,
                        ruleApplied: 'PERFECT_AMOUNT_AND_DATE_WINDOW',
                        origin: 'MANUAL',
                        confirmedAt: new Date()
                    }
                });
                
                await prisma.bankTransaction.update({
                    where: { id: tx.id },
                    data: { status: 'MATCHED' }
                });

                await prisma.dTE.update({
                    where: { id: dte.id },
                    data: { paymentStatus: 'PAID', outstandingAmount: 0 }
                });
                
                console.log(`✅ MATCH EXACTO: Tx ${tx.description} ($${tx.amount}) con ${dte.provider?.name || 'Desconocido'} (Folio: ${dte.folio})`);
                newMatches++;
            }
        }
    }
    
    console.log(`\n🎉 Motor Rápido finalizado. Se confirmaron ${newMatches} matches perfectos.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
