import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Starting Orphan MatchSuggestion Cleanup...");

    const pendingSuggestions = await prisma.matchSuggestion.findMany({
        where: { status: 'PENDING' },
    });

    let deletedOrphans = 0;
    const toDeleteIds: string[] = [];

    // Pre-fetch all valid transaction and DTE IDs to minimize DB calls
    const allTxIdsSet = new Set(
        (await prisma.bankTransaction.findMany({ select: { id: true } })).map(t => t.id)
    );
    const allDteIdsSet = new Set(
        (await prisma.dTE.findMany({ select: { id: true } })).map(d => d.id)
    );

    for (const sug of pendingSuggestions) {
        let isOrphan = false;

        // Check if primary DTE exists
        if (!allDteIdsSet.has(sug.dteId)) {
            isOrphan = true;
        }

        // Check if related DTEs exist (if applicable)
        if (!isOrphan && sug.relatedDteIds && Array.isArray(sug.relatedDteIds)) {
            for (const relDteId of sug.relatedDteIds as string[]) {
                if (!allDteIdsSet.has(relDteId)) {
                    isOrphan = true;
                    break;
                }
            }
        }

        // Check if ALL transactionIds exist
        if (!isOrphan && sug.transactionIds && Array.isArray(sug.transactionIds)) {
            const txs = sug.transactionIds as string[];
            if (txs.length === 0) {
                isOrphan = true;
            } else {
                for (const txId of txs) {
                    if (!allTxIdsSet.has(txId)) {
                        isOrphan = true;
                        break;
                    }
                }
            }
        }

        // Check if confidence is extremely low (below 0.55 logic in engine, or an old bug)
        // If it's a SUM suggestion that hasn't cleared, let's keep it if it's perfectly valid, 
        // the user's main complaint was just orphans.
        
        if (isOrphan) {
            toDeleteIds.push(sug.id);
            deletedOrphans++;
        }
    }

    if (toDeleteIds.length > 0) {
        await prisma.matchSuggestion.deleteMany({
            where: { id: { in: toDeleteIds } }
        });
        console.log(`✅ Deleted ${deletedOrphans} orphan PENDING suggestions.`);
    } else {
        console.log("No orphan suggestions found.");
    }

    // Secondary Cleanup: What about suggestions where the DTE is already PAID? 
    // They are invalid even if they aren't technically orphaned IDs.
    const staleSumSuggestions = await prisma.matchSuggestion.findMany({
        where: {
            status: 'PENDING',
            dte: { paymentStatus: 'PAID' }
        }
    });

    if (staleSumSuggestions.length > 0) {
        await prisma.matchSuggestion.deleteMany({
            where: { id: { in: staleSumSuggestions.map(s => s.id) } }
        });
        console.log(`✅ Deleted ${staleSumSuggestions.length} stale suggestions (DTE already PAID).`);
    }

    // Tertiary Cleanup: Transactions already matched
    const suggestionsWithMatchedTxs = await prisma.matchSuggestion.findMany({
        where: { status: 'PENDING' },
    });
    
    let deletedMatchedTxs = 0;
    const staleTxSugs: string[] = [];
    const matchedTxIdsSet = new Set(
        (await prisma.bankTransaction.findMany({ 
            where: { status: { notIn: ['PENDING', 'PARTIALLY_MATCHED', 'UNMATCHED'] } },
            select: { id: true } 
        })).map(t => t.id)
    );

    for (const sug of suggestionsWithMatchedTxs) {
        if (!toDeleteIds.includes(sug.id) && sug.transactionIds && Array.isArray(sug.transactionIds)) {
            for (const txId of sug.transactionIds as string[]) {
                if (matchedTxIdsSet.has(txId)) {
                    staleTxSugs.push(sug.id);
                    deletedMatchedTxs++;
                    break;
                }
            }
        }
    }

    if (staleTxSugs.length > 0) {
        await prisma.matchSuggestion.deleteMany({
            where: { id: { in: staleTxSugs } }
        });
        console.log(`✅ Deleted ${deletedMatchedTxs} stale suggestions (Transaction already MATCHED).`);
    }

    console.log("Cleanup completely finished.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
