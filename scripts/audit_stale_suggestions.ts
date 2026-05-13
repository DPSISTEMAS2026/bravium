import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
    const pending = await p.matchSuggestion.findMany({
        where: { status: 'PENDING' },
        select: { id: true, type: true, transactionIds: true, reason: true }
    });

    let withUnmatched = 0;
    let withPending = 0;
    let mixed = 0;

    for (const s of pending) {
        const txIds = (s.transactionIds || []) as string[];
        const txs = await p.bankTransaction.findMany({
            where: { id: { in: txIds } },
            select: { id: true, status: true }
        });
        const statuses = txs.map(t => t.status);
        const hasUnmatched = statuses.some(s => s === 'UNMATCHED');
        const hasPending = statuses.some(s => s === 'PENDING' || s === 'PARTIALLY_MATCHED');

        if (hasUnmatched && hasPending) mixed++;
        else if (hasUnmatched) withUnmatched++;
        else if (hasPending) withPending++;
    }

    console.log(`Total PENDING suggestions: ${pending.length}`);
    console.log(`  Solo TXs PENDING/PARTIALLY_MATCHED (válidas): ${withPending}`);
    console.log(`  Solo TXs UNMATCHED (inválidas, deben eliminarse): ${withUnmatched}`);
    console.log(`  Mixtas UNMATCHED+PENDING: ${mixed}`);
    console.log(`\n  → Sugerencias reales a mostrar: ${withPending + mixed}`);
}
main().catch(console.error).finally(() => p.$disconnect());
