import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const targetAccountId = 'acc-santander-9219882-0';

    console.log("🔧 Reparando estados post-migración...\n");

    // 1. Borrar TODOS los DRAFT del motor que se crearon después de la migración
    const deletedDrafts = await prisma.reconciliationMatch.deleteMany({
        where: {
            transaction: { bankAccountId: targetAccountId },
            status: 'DRAFT'
        }
    });
    console.log(`🗑️ Eliminados ${deletedDrafts.count} matches DRAFT erróneos.`);

    // 2. Encontrar las transacciones que SÍ tienen un match CONFIRMED y ponerlas como MATCHED
    const confirmedMatches = await prisma.reconciliationMatch.findMany({
        where: {
            transaction: { bankAccountId: targetAccountId },
            status: 'CONFIRMED'
        },
        select: { transactionId: true }
    });

    const confirmedTxIds = [...new Set(confirmedMatches.map(m => m.transactionId))];

    if (confirmedTxIds.length > 0) {
        const updated = await prisma.bankTransaction.updateMany({
            where: { id: { in: confirmedTxIds } },
            data: { status: 'MATCHED' }
        });
        console.log(`✅ ${updated.count} transacciones marcadas como MATCHED (tenían match CONFIRMED).`);
    }

    // 3. Las que NO tienen match confirmado deben quedar PENDING
    const resetPending = await prisma.bankTransaction.updateMany({
        where: {
            bankAccountId: targetAccountId,
            id: { notIn: confirmedTxIds },
            status: { not: 'UNMATCHED' } // No tocar las revisadas manualmente
        },
        data: { status: 'PENDING' }
    });
    console.log(`🔄 ${resetPending.count} transacciones reseteadas a PENDING (sin match confirmado).`);

    // 4. También resetear las PARTIALLY_MATCHED que quedaron del motor erróneo
    const resetPartial = await prisma.bankTransaction.updateMany({
        where: {
            bankAccountId: targetAccountId,
            status: 'PARTIALLY_MATCHED'
        },
        data: { status: 'PENDING' }
    });
    console.log(`🔄 ${resetPartial.count} transacciones PARTIALLY_MATCHED reseteadas a PENDING.`);

    // Conteo final
    const finalStats = await prisma.bankTransaction.groupBy({
        by: ['status'],
        where: { bankAccountId: targetAccountId },
        _count: { id: true }
    });

    console.log(`\n========== ESTADO FINAL ==========`);
    finalStats.forEach(s => console.log(`${s.status}: ${s._count.id}`));

    const totalMatches = await prisma.reconciliationMatch.count({
        where: { transaction: { bankAccountId: targetAccountId } }
    });
    console.log(`Total matches de conciliación: ${totalMatches}`);
    console.log(`==================================`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
