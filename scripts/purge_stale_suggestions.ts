/**
 * purge_stale_suggestions.ts
 * Marca como REJECTED las sugerencias PENDING cuyas TXs son todas UNMATCHED.
 * Estas se generaron por error durante el reset temporal.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
    const pending = await p.matchSuggestion.findMany({
        where: { status: 'PENDING' },
        select: { id: true, type: true, transactionIds: true }
    });

    const toReject: string[] = [];

    for (const s of pending) {
        const txIds = (s.transactionIds || []) as string[];
        if (txIds.length === 0) continue;
        const txs = await p.bankTransaction.findMany({
            where: { id: { in: txIds } },
            select: { status: true }
        });
        // Si TODAS las TXs son UNMATCHED → sugerencia obsoleta
        const allUnmatched = txs.every(t => t.status === 'UNMATCHED');
        if (allUnmatched) toReject.push(s.id);
    }

    console.log(`Sugerencias a rechazar (todas sus TXs son UNMATCHED): ${toReject.length}`);
    if (toReject.length > 0) {
        const r = await p.matchSuggestion.updateMany({
            where: { id: { in: toReject } },
            data: { status: 'REJECTED', reason: 'TXs asociadas marcadas como UNMATCHED (revisadas sin DTE)' }
        });
        console.log(`✅ ${r.count} sugerencias rechazadas`);
    }

    // Resumen final
    const final = await p.matchSuggestion.groupBy({
        by: ['status', 'type'], _count: true
    });
    console.log('\nEstado final de sugerencias:');
    for (const s of final.sort((a,b) => a.status.localeCompare(b.status)))
        console.log(`  ${s.type} ${s.status}: ${s._count}`);
}
main().catch(console.error).finally(() => p.$disconnect());
