import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const provider = await prisma.provider.findFirst({
        where: { name: { contains: 'SOUTH AND DESERT' } }
    });
    if (!provider) return;

    // Fetch all unpaid DTEs for this provider
    const dtes = await prisma.dTE.findMany({
        where: { providerId: provider.id, paymentStatus: 'UNPAID' },
        orderBy: { issuedDate: 'asc' }
    });

    // Fetch all pending transactions for this provider's RUT
    // rut is 76594462
    const txs = await prisma.bankTransaction.findMany({
        where: {
            status: 'PENDING',
            date: { gte: new Date('2026-01-01') },
            OR: [
                { description: { contains: '76.594.462' } },
                { description: { contains: '76594462' } }
            ]
        },
        orderBy: { date: 'asc' }
    });

    let availableTxs = [...txs];
    let matchedCount = 0;

    for (const dte of dtes) {
        const cands = availableTxs.filter(t => Math.abs(t.amount) === dte.totalAmount);
        if (cands.length === 0) continue;

        let closestTx = cands[0];
        let minDiff = Math.abs(closestTx.date.getTime() - dte.issuedDate.getTime());
        for(let i=1; i<cands.length; i++) {
            const diff = Math.abs(cands[i].date.getTime() - dte.issuedDate.getTime());
            if (diff < minDiff) {
                minDiff = diff;
                closestTx = cands[i];
            }
        }

        console.log(`✅ Haciendo match de Folio ${dte.folio} (${dte.issuedDate.toISOString().split('T')[0]}) con Tx de ${closestTx.date.toISOString().split('T')[0]}`);

        await prisma.reconciliationMatch.create({
            data: {
                transactionId: closestTx.id,
                dteId: dte.id,
                status: 'CONFIRMED',
                origin: 'MANUAL',
                confidence: 1.0,
                ruleApplied: 'ExactAmount_RUT_Rescue',
                confirmedAt: new Date(),
                confirmedBy: 'system_rescue',
                organizationId: dte.organizationId
            }
        });

        await prisma.dTE.update({
            where: { id: dte.id },
            data: { paymentStatus: 'PAID', outstandingAmount: 0 }
        });

        await prisma.bankTransaction.update({
            where: { id: closestTx.id },
            data: { status: 'MATCHED' }
        });

        availableTxs = availableTxs.filter(t => t.id !== closestTx.id);
        matchedCount++;
    }

    console.log(`\n¡Listo! Se rescataron ${matchedCount} folios perdidos.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
