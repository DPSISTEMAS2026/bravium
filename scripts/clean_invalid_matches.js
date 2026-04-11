const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    const suggestions = await prisma.matchSuggestion.findMany({ where: { status: 'PENDING' } });
    let count = 0;
    for(const s of suggestions) {
        const txIds = s.transactionIds || [];
        const txs = await prisma.bankTransaction.findMany({ where: { id: { in: txIds } } });
        const dte = await prisma.dTE.findUnique({ where: { id: s.dteId } });
        
        const isTxMatched = txs.some(t => t.status === 'MATCHED');
        const isDtePaid = dte && dte.paymentStatus === 'PAID';
        
        if (isTxMatched || isDtePaid) {
            await prisma.matchSuggestion.delete({ where: { id: s.id } });
            count++;
        }
    }
    console.log('Deleted ' + count + ' invalid suggestions');
    await prisma.$disconnect();
}
run();
