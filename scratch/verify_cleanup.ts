import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
    const total = await p.bankTransaction.count();
    const matched = await p.bankTransaction.count({ where: { status: 'MATCHED' } });
    const pending = await p.bankTransaction.count({ where: { status: 'PENDING' } });
    const unmatched = await p.bankTransaction.count({ where: { status: 'UNMATCHED' } });
    const partial = await p.bankTransaction.count({ where: { status: 'PARTIALLY_MATCHED' } });
    const confirmedMatches = await p.reconciliationMatch.count({ where: { status: 'CONFIRMED' } });
    const draftMatches = await p.reconciliationMatch.count({ where: { status: 'DRAFT' } });
    const rejectedMatches = await p.reconciliationMatch.count({ where: { status: 'REJECTED' } });

    console.log('=== POST-CLEANUP STATUS ===');
    console.log(`Transactions: ${total}`);
    console.log(`  MATCHED: ${matched}`);
    console.log(`  PENDING: ${pending}`);
    console.log(`  UNMATCHED: ${unmatched}`);
    console.log(`  PARTIALLY_MATCHED: ${partial}`);
    console.log(`Matches CONFIRMED: ${confirmedMatches}`);
    console.log(`Matches DRAFT: ${draftMatches}`);
    console.log(`Matches REJECTED: ${rejectedMatches}`);

    // Check for any remaining duplicates
    const allTxs = await p.bankTransaction.findMany({ orderBy: { date: 'asc' } });
    const groups = new Map<string, number>();
    for (const tx of allTxs) {
        const key = `${tx.date.toISOString().split('T')[0]}|${tx.amount}|${tx.description.trim()}`;
        groups.set(key, (groups.get(key) || 0) + 1);
    }
    const remainingDups = [...groups.entries()].filter(([, count]) => count > 1);
    console.log(`\nRemaining exact duplicates: ${remainingDups.length}`);
    if (remainingDups.length > 0) {
        remainingDups.slice(0, 5).forEach(([key, count]) => {
            console.log(`  ${key} x${count}`);
        });
    }
}

main().catch(console.error).finally(() => p.$disconnect());
