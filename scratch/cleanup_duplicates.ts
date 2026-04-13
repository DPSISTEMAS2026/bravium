import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Checks if two descriptions are duplicates (same transaction ingested from overlapping files).
 * The key pattern: RUT truncated in one file vs complete in another.
 * e.g. "Transf.Internet a 77.144.339-" vs "Transf.Internet a 77.144.339-7"
 */
function isTrueDuplicate(descA: string, descB: string): boolean {
    const a = descA.trim();
    const b = descB.trim();
    if (a === b) return true;

    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;

    // One is prefix of the other (truncated glosa) - max 2 chars difference
    if (longer.startsWith(shorter) && (longer.length - shorter.length) <= 2) return true;

    // Short descriptions that match exactly after normalization
    const normA = a.replace(/\s+/g, ' ').toLowerCase();
    const normB = b.replace(/\s+/g, ' ').toLowerCase();
    if (normA === normB) return true;

    return false;
}

async function main() {
    const DRY_RUN = !process.argv.includes('--execute');

    console.log(DRY_RUN ? '🔵 DRY RUN MODE (pass --execute to apply)\n' : '🔴 EXECUTING CLEANUP\n');

    const allTxs = await prisma.bankTransaction.findMany({
        include: {
            matches: {
                select: { id: true, status: true, dteId: true },
            },
        },
        orderBy: { date: 'asc' },
    });

    console.log(`Total transactions: ${allTxs.length}`);

    // Group by (date, absAmount) to find potential duplicates
    const groups = new Map<string, typeof allTxs>();
    for (const tx of allTxs) {
        const key = `${tx.date.toISOString().split('T')[0]}|${tx.amount}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(tx);
    }

    let deletedTxCount = 0;
    let deletedMatchCount = 0;
    let skippedLegitimate = 0;
    const toDelete: { txId: string; matchIds: string[]; reason: string }[] = [];

    for (const [key, txs] of groups) {
        if (txs.length < 2) continue;

        // Within this group, find TRUE duplicate clusters
        const used = new Set<string>();

        for (let i = 0; i < txs.length; i++) {
            if (used.has(txs[i].id)) continue;

            const cluster = [txs[i]];
            for (let j = i + 1; j < txs.length; j++) {
                if (used.has(txs[j].id)) continue;
                if (isTrueDuplicate(txs[i].description, txs[j].description)) {
                    cluster.push(txs[j]);
                    used.add(txs[j].id);
                }
            }
            used.add(txs[i].id);

            if (cluster.length < 2) continue;

            // We have a cluster of duplicates. Decide who stays.
            // Priority: 1) Has CONFIRMED match  2) Longer description (more complete)  3) First created
            const sorted = cluster.sort((a, b) => {
                const aConfirmed = a.matches.filter(m => m.status === 'CONFIRMED').length;
                const bConfirmed = b.matches.filter(m => m.status === 'CONFIRMED').length;
                if (aConfirmed !== bConfirmed) return bConfirmed - aConfirmed; // More confirmed = keep
                if (a.description.length !== b.description.length) return b.description.length - a.description.length; // Longer desc = keep
                return a.createdAt.getTime() - b.createdAt.getTime(); // Older = keep
            });

            const keeper = sorted[0];
            const removals = sorted.slice(1);

            for (const rem of removals) {
                const remConfirmedMatches = rem.matches.filter(m => m.status === 'CONFIRMED');

                // If the removal candidate has CONFIRMED matches to DTEs that the keeper ALSO has,
                // those matches are redundant and can be safely deleted.
                // If the removal has CONFIRMED matches to DTEs the keeper does NOT have,
                // we need to reassign them.
                const keeperDteIds = new Set(keeper.matches.filter(m => m.status === 'CONFIRMED').map(m => m.dteId));
                const uniqueConfirmedOnRemoval = remConfirmedMatches.filter(m => !keeperDteIds.has(m.dteId));

                if (uniqueConfirmedOnRemoval.length > 0) {
                    // This removal has confirmed matches to DTEs that the keeper doesn't have.
                    // We should reassign these matches to the keeper rather than deleting them.
                    for (const m of uniqueConfirmedOnRemoval) {
                        if (!DRY_RUN) {
                            await prisma.reconciliationMatch.update({
                                where: { id: m.id },
                                data: { transactionId: keeper.id },
                            });
                        }
                        console.log(`  📎 Reassigned match ${m.id.slice(0, 8)} from TX ${rem.id.slice(0, 8)} → ${keeper.id.slice(0, 8)} (DTE: ${m.dteId?.slice(0, 8)})`);
                    }
                }

                // All remaining matches on the removal (redundant confirmed + drafts) can be deleted
                const matchIdsToDelete = rem.matches
                    .filter(m => !uniqueConfirmedOnRemoval.includes(m))
                    .map(m => m.id);

                toDelete.push({
                    txId: rem.id,
                    matchIds: matchIdsToDelete,
                    reason: `Dup of ${keeper.id.slice(0, 8)} | "${rem.description}" ↔ "${keeper.description}"`,
                });
            }
        }

        // Count legitimate pairs (different descriptions = different recipients)
        const remaining = txs.filter(t => !used.has(t.id));
        if (remaining.length > 1) {
            skippedLegitimate++;
        }
    }

    console.log(`\n========================================`);
    console.log(`CLEANUP PLAN`);
    console.log(`========================================`);
    console.log(`Transactions to delete: ${toDelete.length}`);
    console.log(`Legitimate pairs preserved: ${skippedLegitimate}`);

    if (DRY_RUN) {
        console.log(`\nFirst 15 deletions:`);
        toDelete.slice(0, 15).forEach((d, i) => {
            console.log(`  ${i + 1}. TX ${d.txId.slice(0, 8)} | Matches to delete: ${d.matchIds.length} | ${d.reason}`);
        });
    }

    if (!DRY_RUN) {
        console.log(`\n🔴 Executing...`);

        for (const { txId, matchIds, reason } of toDelete) {
            // 1. Delete matches (drafts and redundant confirmed)
            if (matchIds.length > 0) {
                // First delete any BalanceAdjustments tied to these matches
                await prisma.balanceAdjustment.deleteMany({
                    where: { matchId: { in: matchIds } },
                });
                await prisma.reconciliationMatch.deleteMany({
                    where: { id: { in: matchIds } },
                });
                deletedMatchCount += matchIds.length;
            }

            // 2. Delete any PaymentRecords tied to this transaction
            await prisma.paymentRecord.deleteMany({
                where: { transactionId: txId },
            });

            // 3. Delete the transaction itself
            await prisma.bankTransaction.delete({ where: { id: txId } });
            deletedTxCount++;

            console.log(`  ✅ Deleted TX ${txId.slice(0, 8)} (${matchIds.length} matches) | ${reason}`);
        }

        // 4. Fix transaction statuses for keepers that now have confirmed matches
        console.log(`\n🔧 Fixing transaction statuses...`);
        const txsWithConfirmed = await prisma.bankTransaction.findMany({
            where: {
                matches: { some: { status: 'CONFIRMED' } },
                status: { not: 'MATCHED' },
            },
            select: { id: true, status: true },
        });

        for (const tx of txsWithConfirmed) {
            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: { status: 'MATCHED' },
            });
        }
        console.log(`  Fixed ${txsWithConfirmed.length} transaction statuses.`);

        console.log(`\n========================================`);
        console.log(`CLEANUP COMPLETE`);
        console.log(`========================================`);
        console.log(`Transactions deleted: ${deletedTxCount}`);
        console.log(`Matches deleted: ${deletedMatchCount}`);
        console.log(`Remaining transactions: ${allTxs.length - deletedTxCount}`);
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
