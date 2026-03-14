/**
 * Encuentra matches donde el monto de la transacción y el monto del DTE
 * difieren mucho (ej: pago 4M vinculado a DTE 89k).
 * Uso: node scripts/find_wrong_matches.js [--delete]
 * --delete: elimina los matches encontrados (revierte el vínculo).
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MIN_RATIO = 2;      // si |tx|/|dte| o |dte|/|tx| > este valor, se considera sospechoso
const MIN_DIFF_CLP = 500000; // diferencia mínima en pesos para reportar (ej: 500k)

async function main() {
    const deleteMode = process.argv.includes('--delete');

    const matches = await prisma.reconciliationMatch.findMany({
        where: { dteId: { not: null }, status: { in: ['CONFIRMED', 'DRAFT'] } },
        include: {
            transaction: { select: { id: true, date: true, amount: true, description: true } },
            dte: {
                select: {
                    id: true, folio: true, totalAmount: true, paymentStatus: true,
                    provider: { select: { name: true, rut: true } },
                },
            },
        },
    });

    const wrong = [];
    for (const m of matches) {
        if (!m.transaction || !m.dte) continue;
        const txAbs = Math.abs(m.transaction.amount);
        const dteAbs = Math.abs(m.dte.totalAmount);
        if (txAbs < 1000 || dteAbs < 1000) continue;

        const diff = Math.abs(txAbs - dteAbs);
        const ratio = Math.max(txAbs / dteAbs, dteAbs / txAbs);

        if (ratio >= MIN_RATIO && diff >= MIN_DIFF_CLP) {
            wrong.push({
                matchId: m.id,
                txAmount: m.transaction.amount,
                dteAmount: m.dte.totalAmount,
                diff,
                ratio: ratio.toFixed(1),
                txDesc: m.transaction.description,
                provider: m.dte.provider?.name,
                folio: m.dte.folio,
                status: m.status,
            });
        }
    }

    if (wrong.length === 0) {
        console.log('No se encontraron matches con diferencia de monto sospechosa.');
        return;
    }

    console.log(`\nMatches con diferencia de monto grande (ratio >= ${MIN_RATIO}, diff >= $${MIN_DIFF_CLP.toLocaleString('es-CL')}):\n`);
    for (const w of wrong) {
        console.log(`  Match ${w.matchId}`);
        console.log(`    Transacción: ${w.txAmount?.toLocaleString('es-CL')} | ${(w.txDesc || '').slice(0, 50)}`);
        console.log(`    DTE: Folio ${w.folio} | ${w.dteAmount?.toLocaleString('es-CL')} | ${w.provider || '—'}`);
        console.log(`    Diferencia: $${w.diff.toLocaleString('es-CL')} | ratio ${w.ratio}x | status ${w.status}`);
        console.log('');
    }

    if (deleteMode && wrong.length > 0) {
        console.log(`Eliminando ${wrong.length} match(es) (--delete)...`);
        for (const w of wrong) {
            const m = await prisma.reconciliationMatch.findUnique({
                where: { id: w.matchId },
                include: { dte: true },
            });
            if (!m) continue;
            await prisma.$transaction(async (tx) => {
                await tx.bankTransaction.update({
                    where: { id: m.transactionId },
                    data: { status: 'PENDING' },
                });
                if (m.dteId && m.dte) {
                    await tx.dTE.update({
                        where: { id: m.dteId },
                        data: { paymentStatus: 'UNPAID', outstandingAmount: m.dte.totalAmount },
                    });
                }
                await tx.reconciliationMatch.delete({ where: { id: w.matchId } });
            });
            console.log(`  Eliminado match ${w.matchId} (tx ${m.transactionId} \u2192 DTE ${m.dteId})`);
        }
        console.log('Listo.');
    } else if (wrong.length > 0) {
        console.log('Para eliminar estos matches, ejecuta: node scripts/find_wrong_matches.js --delete');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
