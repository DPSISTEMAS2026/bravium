import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const oneHourAgo = new Date(Date.now() - 2 * 60 * 60 * 1000); // last 2 hours to be safe

    console.log('=== MATCHES CREATED IN THE LAST 2 HOURS ===\n');

    // 1. Find recent matches
    const recentMatches = await prisma.reconciliationMatch.findMany({
        where: { createdAt: { gte: oneHourAgo } },
        include: {
            transaction: true,
            dte: { include: { provider: { select: { name: true, rut: true } } } },
        },
        orderBy: { createdAt: 'desc' },
    });

    console.log(`Found ${recentMatches.length} matches created in the last 2 hours.\n`);

    for (const match of recentMatches) {
        const tx = match.transaction;
        const dte = match.dte;

        console.log(`--- Match ${match.id} ---`);
        console.log(`  Status: ${match.status} | Origin: ${match.origin} | Created: ${match.createdAt.toISOString()}`);
        console.log(`  TX: ${tx.id} | "${tx.description}" | ${tx.amount} | Date: ${tx.date.toISOString().split('T')[0]} | TxStatus: ${tx.status}`);
        if (dte) {
            console.log(`  DTE: Folio ${dte.folio} (T${dte.type}) | ${dte.provider?.name} | $${dte.totalAmount} | Issued: ${dte.issuedDate.toISOString().split('T')[0]}`);
        }

        // 2. For this DTE, find ALL matches (including older ones)
        if (dte) {
            const allDteMatches = await prisma.reconciliationMatch.findMany({
                where: { dteId: dte.id },
                include: { transaction: true },
                orderBy: { createdAt: 'asc' },
            });

            if (allDteMatches.length > 1) {
                console.log(`  ⚠️ This DTE (Folio ${dte.folio}) has ${allDteMatches.length} TOTAL matches:`);
                for (const m of allDteMatches) {
                    const isRecent = m.id === match.id ? ' ← THIS ONE (recent)' : '';
                    console.log(`     Match ${m.id} | Status: ${m.status} | TX: "${m.transaction.description}" (${m.transaction.id}) | TxDate: ${m.transaction.date.toISOString().split('T')[0]}${isRecent}`);
                }

                // 3. Check: are the transactions for this DTE duplicates of each other?
                const txIds = allDteMatches.map(m => m.transactionId);
                const txs = await prisma.bankTransaction.findMany({ where: { id: { in: txIds } } });

                const uniqueDescs = new Set(txs.map(t => t.description.trim()));
                const uniqueDates = new Set(txs.map(t => t.date.toISOString().split('T')[0]));
                const uniqueAmounts = new Set(txs.map(t => t.amount));

                if (uniqueDescs.size === 1 || (uniqueDates.size === 1 && uniqueAmounts.size === 1)) {
                    console.log(`  🔴 CONFIRMED: The transactions matched to Folio ${dte.folio} are DUPLICATES of each other!`);
                    console.log(`     Same desc: ${uniqueDescs.size === 1} | Same date: ${uniqueDates.size === 1} | Same amount: ${uniqueAmounts.size === 1}`);
                }
            }
        }

        // 4. For this TX, find if there's an identical twin in the DB
        const twins = await prisma.bankTransaction.findMany({
            where: {
                date: tx.date,
                amount: tx.amount,
                id: { not: tx.id },
            },
            include: { matches: { select: { id: true, status: true, dteId: true } } },
        });

        const similarTwins = twins.filter(t =>
            t.description.trim().startsWith(tx.description.trim().slice(0, 10)) ||
            tx.description.trim().startsWith(t.description.trim().slice(0, 10))
        );

        if (similarTwins.length > 0) {
            console.log(`  🔵 This TX has ${similarTwins.length} near-identical twin(s):`);
            for (const twin of similarTwins) {
                const twinConfirmed = twin.matches.filter(m => m.status === 'CONFIRMED');
                console.log(`     Twin: ${twin.id} | "${twin.description}" | Status: ${twin.status} | ConfirmedMatches: ${twinConfirmed.length}`);
                if (twinConfirmed.length > 0) {
                    console.log(`       Matched to DTEs: ${twinConfirmed.map(m => m.dteId).join(', ')}`);
                }
            }
        }

        console.log('');
    }

    // 5. Now check: what source files created the duplicates?
    console.log('\n=== INGESTION SOURCE ANALYSIS ===\n');
    const sampleDuplicateTxIds = recentMatches.map(m => m.transactionId);
    if (sampleDuplicateTxIds.length > 0) {
        const txsWithMeta = await prisma.bankTransaction.findMany({
            where: { id: { in: sampleDuplicateTxIds } },
            select: { id: true, description: true, metadata: true, origin: true, bankAccountId: true },
        });

        // Also find their twins
        for (const tx of txsWithMeta) {
            const meta = tx.metadata as any;
            console.log(`TX ${tx.id.slice(0, 8)} | "${tx.description}" | Origin: ${tx.origin} | Source: ${meta?.sourceFile || meta?.source || 'N/A'} | BankAcct: ${tx.bankAccountId.slice(0, 8)}`);

            // Find twin
            const fullTx = await prisma.bankTransaction.findUnique({ where: { id: tx.id } });
            if (fullTx) {
                const twins = await prisma.bankTransaction.findMany({
                    where: {
                        date: fullTx.date,
                        amount: fullTx.amount,
                        id: { not: tx.id },
                    },
                    select: { id: true, description: true, metadata: true, origin: true, bankAccountId: true },
                });

                for (const twin of twins) {
                    const twinMeta = twin.metadata as any;
                    if (twin.description.trim().slice(0, 10) === tx.description.trim().slice(0, 10) ||
                        tx.description.trim().startsWith(twin.description.trim().slice(0, 10))) {
                        console.log(`  TWIN ${twin.id.slice(0, 8)} | "${twin.description}" | Origin: ${twin.origin} | Source: ${twinMeta?.sourceFile || twinMeta?.source || 'N/A'} | BankAcct: ${twin.bankAccountId.slice(0, 8)}`);
                    }
                }
            }
        }
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
