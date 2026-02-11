
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 1. Check Matches
    const matches = await prisma.reconciliationMatch.findMany({
        include: {
            transaction: true,
            dte: { select: { totalAmount: true, issuedDate: true } },
            payment: true
        }
    });

    console.log(`\n--- Match Verification ---`);
    console.log(`Total Matches Found: ${matches.length}`);

    matches.forEach(m => {
        console.log(`[${m.status}] Score: ${m.confidence.toFixed(2)}`);
        console.log(`   Tx: ${m.transaction.description} ($${m.transaction.amount})`);
        if (m.dte) console.log(`   DTE: $${m.dte.totalAmount} (${m.dte.issuedDate.toISOString().split('T')[0]})`);
        if (m.payment) console.log(`   Payment: $${m.payment.amount}`);
        console.log('---');
    });

    // 2. Check Unmatched Transactions that SHOULD match (debug)
    // Example: Find transactions with same amount as a DTE but no match
    /*
    const txs = await prisma.bankTransaction.findMany({ where: { status: 'PENDING' } });
    for (const tx of txs) {
        // ... logic
    }
    */
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
