
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- DEBUG RECONCILIATION ---');

    // 1. Get recent Bank Transactions
    const txs = await prisma.bankTransaction.findMany({
        where: { origin: 'N8N_AUTOMATION', status: { in: ['PENDING', 'UNMATCHED'] } },
        orderBy: { date: 'desc' },
        take: 20
    });

    console.log(`Analyzing ${txs.length} Pending Transactions...`);

    // 2. Get recent DTEs
    const dtes = await prisma.dTE.findMany({
        take: 50,
        orderBy: { issuedDate: 'desc' }
    });

    console.log(`Comparing against ${dtes.length} DTEs...`);

    for (const tx of txs) {
        console.log(`\nTX [${tx.date.toISOString().split('T')[0]}] ${tx.description} | Amt: ${tx.amount}`);

        // Find close matches manually
        const candidates = dtes.filter(dte => {
            const amountDiff = Math.abs(Math.abs(tx.amount) - dte.totalAmount);
            const dateDiff = Math.abs(tx.date.getTime() - dte.issuedDate.getTime()) / (1000 * 60 * 60 * 24);

            // Loose filter for debug
            return amountDiff < 2000 && dateDiff < 10;
        });

        if (candidates.length > 0) {
            console.log(`   >>> POTENTIAL MATCHES FOUND: ${candidates.length}`);
            candidates.forEach(c => {
                const amountDiff = Math.abs(Math.abs(tx.amount) - c.totalAmount);
                const dateDiff = Math.abs(tx.date.getTime() - c.issuedDate.getTime()) / (1000 * 60 * 60 * 24);
                console.log(`       - DTE [${c.issuedDate.toISOString().split('T')[0]}] Amt: ${c.totalAmount} (Diff: ${amountDiff}, Days: ${dateDiff.toFixed(1)})`);
            });
        } else {
            console.log(`   (No close candidates found within +/- 2000 CLP and 10 days)`);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
