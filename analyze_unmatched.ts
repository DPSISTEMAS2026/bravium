import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const pendingTxs = await prisma.bankTransaction.findMany({
        where: { status: 'PENDING', type: 'DEBIT', date: { gte: new Date('2026-01-01') } }
    });

    console.log(`Total Pending Debits 2026: ${pendingTxs.length}`);

    let perfectSingleMatchOutsider = 0;
    let exactMultipleMatch = 0;
    let noMatch = 0;
    let alreadyPaidMatch = 0; // The DTE exists with exactly the same amount but it's PAID
    
    for (const tx of pendingTxs) {
        const absAmount = Math.abs(tx.amount);
        
        // Let's check ANY DTE with that amount, regardless of date or status
        const allDtesWithAmount = await prisma.dTE.findMany({
            where: { totalAmount: absAmount } // note totalAmount vs outstandingAmount
        });

        if (allDtesWithAmount.length === 0) {
            noMatch++;
        } else {
            // there are some DTEs
            const unpaidDtes = allDtesWithAmount.filter(d => d.paymentStatus === 'UNPAID' || d.paymentStatus === 'PARTIAL');
            if (unpaidDtes.length === 1) {
                // If it's 1 and UNPAID, why didn't we match it?
                // Probably date window?
                perfectSingleMatchOutsider++;
                // console.log(`Pending TX ${tx.amount} on ${tx.date.toISOString().split('T')[0]} has 1 UNPAID DTE folio ${unpaidDtes[0].folio} on ${unpaidDtes[0].issuedDate.toISOString().split('T')[0]}`);
            } else if (unpaidDtes.length > 1) {
                exactMultipleMatch++;
            } else if (unpaidDtes.length === 0) {
                alreadyPaidMatch++;
            }
        }
    }

    console.log(`- Sin ningún DTE existente por ese monto exacto: ${noMatch}`);
    console.log(`- Tienen 1 DTE exacto UNPAID pero la fecha es muy lejana (>30 días): ${perfectSingleMatchOutsider}`);
    console.log(`- Tienen MÚLTIPLES DTEs exactos UNPAID (el bot no sabe cuál elegir): ${exactMultipleMatch}`);
    console.log(`- Tienen DTEs exactos pero ya están PAGADOS (ocupados): ${alreadyPaidMatch}`);

    await prisma.$disconnect();
}
main().catch(console.error);
