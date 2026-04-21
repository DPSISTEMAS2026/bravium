import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ORG_ID = '715545b8-4522-4bb1-be81-3047546c0e8c';

async function main() {
    console.log('--- INICIANDO ACEPTACION DE MATCHES SEGUROS ---');

    // 1. Grupo 1: Alta Confianza (>= 0.9)
    const suggestions = await prisma.matchSuggestion.findMany({
        where: {
            organizationId: ORG_ID,
            status: 'PENDING',
            confidence: { gte: 0.9 }
        },
        include: { dte: true }
    });

    let countG1 = 0;
    for (const sug of suggestions) {
        const txIds = sug.transactionIds as any;
        if (!sug.dteId || !txIds || txIds.length === 0) continue;
        const txId = txIds[0];
        
        // Verificar q no se haya pagado ya
        const dteCheck = await prisma.dTE.findUnique({ where: { id: sug.dteId }});
        const txCheck = await prisma.bankTransaction.findUnique({ where: { id: txId }});
        if (dteCheck?.paymentStatus === 'PAID' || txCheck?.status === 'MATCHED') continue;

        // Crear Match
        await prisma.reconciliationMatch.create({
            data: {
                organizationId: ORG_ID,
                status: 'CONFIRMED',
                transactionId: txCheck!.id,
                dteId: dteCheck!.id,
                origin: 'AUTOMATIC',
                confidence: sug.confidence,
                ruleApplied: sug.reason,
                confirmedAt: new Date(),
                confirmedBy: 'auto_script'
            }
        });

        // Actualizar estados
        await prisma.dTE.update({
            where: { id: dteCheck!.id },
            data: { paymentStatus: 'PAID', outstandingAmount: 0 }
        });
        await prisma.bankTransaction.update({
            where: { id: txCheck!.id },
            data: { status: 'MATCHED' }
        });
        await prisma.matchSuggestion.update({
            where: { id: sug.id },
            data: { status: 'ACCEPTED' }
        });
        
        countG1++;
        console.log(`[Grupo 1] Aceptado Folio ${dteCheck?.folio}`);
    }


    // 2. Grupo 2: Huérfanos Exactos
    const pendingDtes = await prisma.dTE.findMany({
        where: { organizationId: ORG_ID, paymentStatus: { in: ['UNPAID', 'PARTIAL'] }, outstandingAmount: { gt: 0 } },
        include: { provider: true }
    });

    let pendingTxs = await prisma.bankTransaction.findMany({
        where: { bankAccount: { organizationId: ORG_ID }, status: 'PENDING', type: 'DEBIT' }
    });

    let countG2 = 0;
    for (const dte of pendingDtes) {
        // Encontrar posibles matches por el monto exacto
        const txs = pendingTxs.filter(t => Math.abs(t.amount) === dte.outstandingAmount);
        if (txs.length === 1) {
            const tx = txs[0];
            const diffDays = Math.abs((new Date(tx.date).getTime() - new Date(dte.issuedDate).getTime()) / (1000 * 3600 * 24));
            
            if (diffDays <= 7) {
                // Confirmar
                await prisma.reconciliationMatch.create({
                    data: {
                        organizationId: ORG_ID,
                        status: 'CONFIRMED',
                        transactionId: tx.id,
                        dteId: dte.id,
                        origin: 'MANUAL', // forzado por script manual
                        confidence: 1.0,
                        ruleApplied: 'OrphanExactMatch_Amount_7Days',
                        confirmedAt: new Date(),
                        confirmedBy: 'auto_script'
                    }
                });

                await prisma.dTE.update({
                    where: { id: dte.id },
                    data: { paymentStatus: 'PAID', outstandingAmount: 0 }
                });
                await prisma.bankTransaction.update({
                    where: { id: tx.id },
                    data: { status: 'MATCHED' }
                });

                // Remover la tx
                pendingTxs = pendingTxs.filter(t => t.id !== tx.id);
                countG2++;
                console.log(`[Grupo 2] Aceptado Folio ${dte.folio} con tx ${tx.amount} de ${tx.description}`);

                // Rechazar cualquier sugerencia previa
                await prisma.matchSuggestion.updateMany({
                    where: { dteId: dte.id },
                    data: { status: 'REJECTED' }
                });
            }
        }
    }

    console.log(`\n✅ Resumen Final:`);
    console.log(`- Sugerencias cerradas (Grupo 1): ${countG1}`);
    console.log(`- Huérfanos exactos cerrados (Grupo 2): ${countG2}`);
    console.log(`Total: ${countG1 + countG2} transacciones aseguradas.`);

    await prisma.$disconnect();
}

main().catch(console.error);
