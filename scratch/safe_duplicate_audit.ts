import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Detects TRUE duplicates vs legitimate same-amount transactions.
 * A TRUE duplicate is when two transactions have:
 *   - Same date
 *   - Same amount
 *   - Description where one is a prefix/substring of the other (truncated RUT)
 * 
 * A LEGITIMATE pair is when they have:
 *   - Same date and amount BUT different recipient (different RUT in description)
 */
function isTrueDuplicate(descA: string, descB: string): boolean {
    const a = descA.trim().toLowerCase();
    const b = descB.trim().toLowerCase();

    // Exact match
    if (a === b) return true;

    // One is prefix of the other (truncated glosa)
    if (a.startsWith(b) || b.startsWith(a)) return true;

    // Same base but one has trailing character cut off
    // e.g. "transf.internet a 77.144.339-" vs "transf.internet a 77.144.339-7"
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    if (longer.startsWith(shorter) && (longer.length - shorter.length) <= 2) return true;

    // Extract RUT pattern from descriptions to compare recipients
    const rutPattern = /(\d{1,3}(?:\.\d{3})*-[\dkK]?)/;
    const rutA = a.match(rutPattern);
    const rutB = b.match(rutPattern);

    if (rutA && rutB) {
        // Both have RUTs - check if they point to same recipient
        const cleanA = rutA[1].replace(/\./g, '').replace(/-$/, '');
        const cleanB = rutB[1].replace(/\./g, '').replace(/-$/, '');
        // One is prefix of other (truncated)
        if (cleanA.startsWith(cleanB) || cleanB.startsWith(cleanA)) return true;
    }

    return false;
}

async function main() {
    // Get ALL transactions
    const allTxs = await prisma.bankTransaction.findMany({
        include: { matches: { select: { id: true, status: true } } },
        orderBy: { date: 'asc' },
    });

    console.log(`Total transactions in DB: ${allTxs.length}\n`);

    // Group by (date, amount)
    const groups = new Map<string, typeof allTxs>();
    for (const tx of allTxs) {
        const key = `${tx.date.toISOString().split('T')[0]}|${tx.amount}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(tx);
    }

    // Analyze groups with more than 1 transaction
    const trueDuplicates: { keep: typeof allTxs[0]; remove: typeof allTxs[0] }[] = [];
    const legitimatePairs: (typeof allTxs[0])[][] = [];

    for (const [key, txs] of groups) {
        if (txs.length < 2) continue;

        // Within this group, find TRUE duplicates (similar descriptions)
        const processed = new Set<number>();
        for (let i = 0; i < txs.length; i++) {
            if (processed.has(i)) continue;
            for (let j = i + 1; j < txs.length; j++) {
                if (processed.has(j)) continue;

                if (isTrueDuplicate(txs[i].description, txs[j].description)) {
                    // Determine which to keep: prefer the one with a CONFIRMED match
                    const iHasMatch = txs[i].matches.some(m => m.status === 'CONFIRMED');
                    const jHasMatch = txs[j].matches.some(m => m.status === 'CONFIRMED');

                    if (iHasMatch && jHasMatch) {
                        // Both have confirmed matches - THIS IS A PROBLEM, flag but don't auto-delete
                        console.log(`⚠️ BOTH MATCHED (manual review needed): ${key}`);
                        console.log(`   A: ${txs[i].id} | "${txs[i].description}" | matches: ${txs[i].matches.length}`);
                        console.log(`   B: ${txs[j].id} | "${txs[j].description}" | matches: ${txs[j].matches.length}`);
                    } else {
                        const keep = iHasMatch ? txs[i] : txs[j];
                        const remove = iHasMatch ? txs[j] : txs[i];
                        trueDuplicates.push({ keep, remove });
                    }
                    processed.add(j);
                }
            }
        }

        // Check for legitimate same-amount transactions (different recipients)
        const unprocessed = txs.filter((_, idx) => !processed.has(idx));
        if (unprocessed.length > 1) {
            legitimatePairs.push(unprocessed);
        }
    }

    console.log(`\n========================================`);
    console.log(`TRUE DUPLICATES (safe to remove): ${trueDuplicates.length}`);
    console.log(`========================================`);
    trueDuplicates.forEach(({ keep, remove }, i) => {
        const keepMatches = keep.matches.filter(m => m.status === 'CONFIRMED').length;
        const removeMatches = remove.matches.filter(m => m.status === 'CONFIRMED').length;
        console.log(`\n  #${i + 1} | Date: ${keep.date.toISOString().split('T')[0]} | Amount: ${keep.amount}`);
        console.log(`  KEEP:   ${keep.id} | "${keep.description}" | Status: ${keep.status} | Confirmed Matches: ${keepMatches}`);
        console.log(`  REMOVE: ${remove.id} | "${remove.description}" | Status: ${remove.status} | Confirmed Matches: ${removeMatches}`);
    });

    console.log(`\n========================================`);
    console.log(`LEGITIMATE SAME-AMOUNT PAIRS (different recipients, DO NOT TOUCH): ${legitimatePairs.length}`);
    console.log(`========================================`);
    legitimatePairs.slice(0, 5).forEach((group, i) => {
        console.log(`\n  Group #${i + 1}:`);
        group.forEach(tx => {
            console.log(`    ${tx.id} | "${tx.description}" | ${tx.amount} | ${tx.status}`);
        });
    });
    if (legitimatePairs.length > 5) {
        console.log(`  ... and ${legitimatePairs.length - 5} more groups`);
    }

    console.log(`\n========================================`);
    console.log(`SUMMARY`);
    console.log(`========================================`);
    console.log(`Total transactions: ${allTxs.length}`);
    console.log(`True duplicates to remove: ${trueDuplicates.length}`);
    console.log(`Legitimate same-amount groups: ${legitimatePairs.length}`);
    console.log(`\nRun with --execute to actually delete the duplicates.`);

    // Check if --execute flag passed
    if (process.argv.includes('--execute')) {
        console.log(`\n🔴 EXECUTING CLEANUP...`);
        for (const { remove } of trueDuplicates) {
            // First delete any DRAFT matches pointing to this transaction
            await prisma.reconciliationMatch.deleteMany({
                where: { transactionId: remove.id, status: { not: 'CONFIRMED' } }
            });
            // Then delete the transaction itself
            await prisma.bankTransaction.delete({ where: { id: remove.id } });
            console.log(`  Deleted: ${remove.id} | "${remove.description}"`);
        }
        console.log(`\n✅ Cleanup complete. Removed ${trueDuplicates.length} duplicate transactions.`);
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
