import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
    const stats = await p.matchSuggestion.groupBy({ by: ['status', 'type'], _count: true });
    console.log('matchSuggestion por estado/tipo:');
    for (const s of stats) console.log(`  ${s.type} | ${s.status} : ${s._count}`);
    const total = await p.matchSuggestion.count();
    console.log('Total:', total);

    // Mostrar algunas
    const samples = await p.matchSuggestion.findMany({
        where: { status: 'PENDING' },
        take: 5,
        include: { dte: { select: { folio: true, totalAmount: true, provider: { select: { name: true } } } } }
    });
    console.log('\nEjemplos PENDING:');
    for (const s of samples) {
        console.log(`  [${s.type}] DTE F${s.dte?.folio} $${s.dte?.totalAmount?.toLocaleString('es-CL')} (${s.dte?.provider?.name?.slice(0,30)}) | conf: ${s.confidence}`);
        console.log(`    reason: ${s.reason?.slice(0, 80)}`);
    }
}
main().catch(console.error).finally(() => p.$disconnect());
