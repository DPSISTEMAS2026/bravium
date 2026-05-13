import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
    const byStrategy = await p.reconciliationMatch.groupBy({
        by: ['ruleApplied'],
        where: { status: 'DRAFT' },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } }
    });
    console.log('=== STATS POST-CASCADE ===\n');
    console.log('DRAFT matches por estrategia:');
    for (const s of byStrategy) {
        const key = (s.ruleApplied || 'unknown').substring(0, 80);
        console.log(`  ${s._count.id.toString().padStart(3)}  ->  ${key}`);
    }

    const [pending, partial, drafts, confirmed] = await Promise.all([
        p.bankTransaction.count({ where: { status: 'PENDING' } }),
        p.bankTransaction.count({ where: { status: 'PARTIALLY_MATCHED' } }),
        p.reconciliationMatch.count({ where: { status: 'DRAFT' } }),
        p.reconciliationMatch.count({ where: { status: 'CONFIRMED' } }),
    ]);
    
    const rutFirst = byStrategy.filter(s => s.ruleApplied?.includes('RutFirst') || s.ruleApplied?.includes('P0-RUT'));
    const rutCount = rutFirst.reduce((s, r) => s + r._count.id, 0);

    console.log('\n--- Resumen ---');
    console.log('TX PENDING:        ', pending, '  (antes: 278)');
    console.log('TX PARTIAL:        ', partial, '  (antes: 89)');
    console.log('DRAFT matches:     ', drafts,  '  (antes: 124)');
    console.log('CONFIRMED matches: ', confirmed, '  (antes: 681)');
    console.log('\nPass 0 (RUT-First):', rutCount, 'DRAFTs');
    console.log('Pass 1 (Monto+Fecha):', drafts - rutCount, 'DRAFTs');
}
main().catch(console.error).finally(() => p.$disconnect());
