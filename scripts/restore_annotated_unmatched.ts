/**
 * restore_annotated_unmatched.ts
 * Restaura a UNMATCHED las TXs que fueron incorrectamente reseteadas a PENDING
 * pero que tenían metadata.reviewNote (anotadas manualmente = "revisadas, sin DTE").
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
    const org = await p.organization.findFirst({ where: { isActive: true } });
    if (!org) throw new Error('No org');

    // TXs que están PENDING pero tienen reviewNote → estaban UNMATCHED, fueron reseteadas por error
    const txs = await p.bankTransaction.findMany({
        where: {
            status: 'PENDING',
            type: 'DEBIT',
            bankAccount: { organizationId: org.id },
        },
        select: { id: true, amount: true, date: true, description: true, metadata: true }
    });

    const toRestore: string[] = [];
    for (const tx of txs) {
        const meta = tx.metadata as any;
        // Si tiene reviewNote → fue anotada manualmente → volver a UNMATCHED
        if (meta?.reviewNote) {
            toRestore.push(tx.id);
            console.log(`  Restaurar UNMATCHED: $${Math.abs(tx.amount).toLocaleString('es-CL')} | ${tx.date.toISOString().slice(0,10)} | "${meta.reviewNote?.slice(0,50)}" | ${tx.description?.slice(0,40)}`);
        }
    }

    console.log(`\nTotal a restaurar: ${toRestore.length}`);

    if (toRestore.length > 0) {
        const result = await p.bankTransaction.updateMany({
            where: { id: { in: toRestore } },
            data: { status: 'UNMATCHED' }
        });
        console.log(`✅ ${result.count} TXs restauradas a UNMATCHED`);
    }

    // Resumen final
    const counts = await p.bankTransaction.groupBy({
        by: ['status'],
        where: { bankAccount: { organizationId: org.id }, type: 'DEBIT' },
        _count: true,
    });
    console.log('\nEstado final:');
    for (const c of counts) console.log(`  ${c.status}: ${c._count}`);
}

main().catch(console.error).finally(() => p.$disconnect());
