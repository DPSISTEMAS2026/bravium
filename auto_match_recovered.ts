import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Buscando calces perfectos (monto exacto a 1 documento) para movimientos pendientes...");
    
    const pendingTxs = await prisma.bankTransaction.findMany({
        where: {
            status: 'PENDING',
            type: 'DEBIT',
            date: { gte: new Date('2026-01-01') }
        },
        include: { bankAccount: true }
    });

    let matchedCount = 0;

    for (const tx of pendingTxs) {
        const absAmount = Math.abs(tx.amount);
        
        // Ventana de fechas: 30 días antes, 15 días después del movimiento bancario
        const txDate = new Date(tx.date);
        const minDate = new Date(txDate.getTime() - 30 * 86400000);
        const maxDate = new Date(txDate.getTime() + 15 * 86400000);

        // Buscar DTEs pendientes que calcen exacto con este monto en esa ventana de tiempo
        const matchingDtes = await prisma.dTE.findMany({
            where: {
                paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
                outstandingAmount: absAmount,
                issuedDate: { gte: minDate, lte: maxDate }
            }
        });

        // Si hay EXACTAMENTE un DTE con ese monto en la ventana de tiempo, los casamos.
        if (matchingDtes.length === 1) {
            const dte = matchingDtes[0];
            
            console.log(`Calzando mov ${tx.amount} (${tx.date.toISOString().split('T')[0]}) con DTE folio ${dte.folio} por ${dte.outstandingAmount}`);

            await prisma.reconciliationMatch.create({
                data: {
                    origin: 'MANUAL',
                    status: 'CONFIRMED',
                    transactionId: tx.id,
                    dteId: dte.id,
                    organizationId: tx.bankAccount.organizationId,
                    confidence: 1.0,
                    ruleApplied: 'ExactAmountRecovery'
                }
            });

            // Actualizamos la transaccion a MATCHED
            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: { status: 'MATCHED' }
            });

            // Actualizamos el DTE a PAID
            await prisma.dTE.update({
                where: { id: dte.id },
                data: {
                    paymentStatus: 'PAID',
                    outstandingAmount: 0
                }
            });

            matchedCount++;
        }
    }

    console.log(`\n¡Listo! Logré calzar automáticamente de forma perfecta ${matchedCount} movimientos.`);
    await prisma.$disconnect();
}
main().catch(console.error);
