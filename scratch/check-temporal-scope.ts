import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const braviumId = '715545b8-4522-4bb1-be81-3047546c0e8c';

    console.log('--- AUDITORÍA DE ALCANCE TEMPORAL (BRAVIUM) ---');

    // Rangos de Transacciones
    const txRange = await prisma.bankTransaction.aggregate({
        where: { bankAccount: { organizationId: braviumId } },
        _min: { date: true },
        _max: { date: true },
        _count: { id: true }
    });

    // Rangos de DTEs
    const dteRange = await prisma.dTE.aggregate({
        where: { organizationId: braviumId },
        _min: { issuedDate: true },
        _max: { issuedDate: true },
        _count: { id: true }
    });

    // Rangos de Sugerencias (Status DRAFT/PENDING)
    const draftMatches = await prisma.reconciliationMatch.findMany({
        where: { organizationId: braviumId, status: 'DRAFT' },
        include: { transaction: true }
    });

    let minTxDateSug = null;
    let maxTxDateSug = null;
    if (draftMatches.length > 0) {
        const dates = draftMatches.map(m => m.transaction?.date).filter(Boolean) as Date[];
        minTxDateSug = new Date(Math.min(...dates.map(d => d.getTime())));
        maxTxDateSug = new Date(Math.max(...dates.map(d => d.getTime())));
    }

    console.log('\nTransacciones Bancarias:');
    console.log(`  Count: ${txRange._count.id}`);
    console.log(`  Desde: ${txRange._min.date?.toISOString().split('T')[0]}`);
    console.log(`  Hasta: ${txRange._max.date?.toISOString().split('T')[0]}`);

    console.log('\nDTEs (Facturas):');
    console.log(`  Count: ${dteRange._count.id}`);
    console.log(`  Desde: ${dteRange._min.issuedDate?.toISOString().split('T')[0]}`);
    console.log(`  Hasta: ${dteRange._max.issuedDate?.toISOString().split('T')[0]}`);

    console.log('\nAlcance de las Sugerencias Actuales:');
    console.log(`  Sugerencias 1:1: ${draftMatches.length}`);
    console.log(`  Cubren transacciones desde: ${minTxDateSug?.toISOString().split('T')[0]}`);
    console.log(`  Hasta: ${maxTxDateSug?.toISOString().split('T')[0]}`);

    // Nota: El query de meses por Raw SQL puede fallar si los nombres de columnas cambian.
    // Usaremos Prisma findMany para ser más seguros.
    const allTxs = await prisma.bankTransaction.findMany({
        where: { bankAccount: { organizationId: braviumId } },
        select: {
            date: true,
            matches: {
                select: { id: true }
            }
        }
    });

    const monthlyStats: Record<string, { total: number, matchedOrSuggested: number }> = {};
    allTxs.forEach(tx => {
        const monthKey = `${tx.date.getFullYear()}-${(tx.date.getMonth() + 1).toString().padStart(2, '0')}`;
        if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { total: 0, matchedOrSuggested: 0 };
        monthlyStats[monthKey].total++;
        if (tx.matches.length > 0) {
            monthlyStats[monthKey].matchedOrSuggested++;
        }
    });

    console.log('\nCobertura por Mes (Bravium):');
    console.table(Object.entries(monthlyStats).map(([month, data]) => ({
        Mes: month,
        TotalTx: data.total,
        ConMatchOSugerencia: data.matchedOrSuggested,
        Porcentaje: ((data.matchedOrSuggested / data.total) * 100).toFixed(1) + '%'
    })));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
