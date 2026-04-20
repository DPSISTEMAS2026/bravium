import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Iniciando Corrección de Conciliación ---');
    const providers = await prisma.provider.findMany({
        where: { name: { contains: 'SOUTH AND DESERT', mode: 'insensitive' } }
    });
    
    if (providers.length === 0) {
        console.log('No se encontro el proveedor.');
        return;
    }
    const provider = providers[0];
    
    // 1. Fetch data
    const dtes = await prisma.dTE.findMany({
        where: { 
            providerId: provider.id,
            issuedDate: { gte: new Date('2026-01-01'), lte: new Date('2026-12-31') }
        },
        include: {
            matches: {
                where: { status: 'CONFIRMED' },
                include: { transaction: true }
            }
        },
        orderBy: { issuedDate: 'asc' }
    });

    const txs = await prisma.bankTransaction.findMany({
        where: {
            date: { gte: new Date('2026-01-01'), lte: new Date('2026-12-31') },
            OR: [
                { description: { contains: 'SOUTH', mode: 'insensitive' } },
                { description: { contains: 'DESERT', mode: 'insensitive' } },
                { matches: { some: { dte: { providerId: provider.id } } } }
            ]
        },
        include: { matches: true },
        orderBy: { date: 'asc' }
    });

    console.log(`DTEs: ${dtes.length}, Txs: ${txs.length}`);

    const oldMatchIds: string[] = [];
    const txsToUnmatch: Set<string> = new Set();
    const dtesToUnmatch: Set<string> = new Set();

    // 2. Collect current match IDs to clear them
    dtes.forEach(dte => {
        dte.matches.forEach(m => {
            oldMatchIds.push(m.id);
            txsToUnmatch.add(m.transactionId);
            dtesToUnmatch.add(dte.id);
        });
    });

    txs.forEach(tx => {
        tx.matches.forEach(m => {
            if (m.status === 'CONFIRMED' && !oldMatchIds.includes(m.id)) {
                oldMatchIds.push(m.id);
                txsToUnmatch.add(tx.id);
                if (m.dteId) dtesToUnmatch.add(m.dteId);
            }
        });
    });

    // 3. Clear existing matches
    if (oldMatchIds.length > 0) {
        console.log(`Borrando ${oldMatchIds.length} matches anteriores...`);
        await prisma.reconciliationMatch.deleteMany({
            where: { id: { in: oldMatchIds } }
        });
        
        // Revert DTEs to UNPAID
        if (dtesToUnmatch.size > 0) {
            await prisma.dTE.updateMany({
                where: { id: { in: Array.from(dtesToUnmatch) } },
                data: { paymentStatus: 'UNPAID' }
            });
            
            // We'd also ideally set outstandingAmount back to totalAmount, we can do it one by one
            const impactedDtes = await prisma.dTE.findMany({ where: { id: { in: Array.from(dtesToUnmatch) } }});
            for (const d of impactedDtes) {
                await prisma.dTE.update({
                     where: { id: d.id },
                     data: { outstandingAmount: d.totalAmount }
                });
            }
        }
        
        // Revert Txs to PENDING
        if (txsToUnmatch.size > 0) {
            await prisma.bankTransaction.updateMany({
                where: { id: { in: Array.from(txsToUnmatch) } },
                data: { status: 'PENDING' }
            });
        }
    }

    // 4. Recalculate matches
    let availableTxs = [...txs];
    
    for (const dte of dtes) {
        const amountCands = availableTxs.filter(t => Math.abs(t.amount) === dte.totalAmount);
        if (amountCands.length === 0) continue;
        
        let closestTx = amountCands[0];
        let minDiff = Math.abs(closestTx.date.getTime() - dte.issuedDate.getTime());
        
        for(let i=1; i<amountCands.length; i++) {
            const diff = Math.abs(amountCands[i].date.getTime() - dte.issuedDate.getTime());
            if (diff < minDiff) {
                minDiff = diff;
                closestTx = amountCands[i];
            }
        }
        
        // Apply new matching!
        console.log(`Matching Folio ${dte.folio} con Tx ${closestTx.date.toISOString().split('T')[0]}`);
        
        await prisma.reconciliationMatch.create({
            data: {
                transactionId: closestTx.id,
                dteId: dte.id,
                status: 'CONFIRMED',
                origin: 'MANUAL',
                confidence: 1.0,
                ruleApplied: 'ExactAmount_ClosestDate_Fix',
                confirmedAt: new Date(),
                confirmedBy: 'system_fix',
                organizationId: dte.organizationId
            }
        });
        
        await prisma.dTE.update({
            where: { id: dte.id },
            data: {
                paymentStatus: 'PAID',
                outstandingAmount: 0
            }
        });
        
        await prisma.bankTransaction.update({
            where: { id: closestTx.id },
            data: { status: 'MATCHED' }
        });
        
        // remove matched tx
        availableTxs = availableTxs.filter(t => t.id !== closestTx.id);
    }

    console.log('¡Corrección Completada Exitosamente!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
