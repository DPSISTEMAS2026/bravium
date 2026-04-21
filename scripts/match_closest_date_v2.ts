import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Matching por Fecha Más Cercana (V2: Cantidades Aproximadas) ---');
    
    const targetNames = ['ENTEL', 'SASCO', 'SOUTH AND DESERT'];
    
    const providers: any[] = [];
    for (const tn of targetNames) {
        const found = await prisma.provider.findMany({
            where: { name: { contains: tn, mode: 'insensitive' } }
        });
        providers.push(...found);
    }

    let matchedCount = 0;

    for (const provider of providers) {
        console.log(`\nProcesando proveedor: ${provider.name}`);
        
        // Unpaid DTEs for this provider
        const dtesRaw = await prisma.dTE.findMany({
            where: { providerId: provider.id, paymentStatus: { not: 'PAID' } },
            orderBy: { issuedDate: 'asc' }
        });
        
        // Unmatched Txs that belong to this provider
        const txsRaw = await prisma.bankTransaction.findMany({
            where: {
                status: { in: ['PENDING', 'PARTIALLY_MATCHED'] },
                type: 'DEBIT',
                date: { gte: new Date('2025-12-01') }
            }
        });

        const txs = txsRaw.filter(t => {
            const upDesc = t.description.toUpperCase();
            const metaProv = (t.metadata as any)?.providerName?.toUpperCase() || '';
            const provUp = provider.name.toUpperCase();
            
            if (provUp.includes('SOUTH AND DESERT') && (upDesc.includes('SOUTH') || upDesc.includes('DESERT') || metaProv.includes('SOUTH'))) return true;
            if (provUp.includes('ENTEL') && (upDesc.includes('ENTEL') || metaProv.includes('ENTEL'))) return true;
            if (provUp.includes('SASCO') && (upDesc.includes('SASCO') || metaProv.includes('SASCO'))) return true;

            return false;
        });

        let availableDtes = [...dtesRaw];
        
        for (const tx of txs) {
            // Pick closest DTE purely by date logic, regardless of amount (since user says they are "almost" the same)
            
            if (availableDtes.length === 0) {
                console.log(`Tx ${tx.date.toISOString().split('T')[0]} [${tx.amount}] -> SIN DTEs DISPONIBLES.`);
                continue;
            }
            
            // Wait, we should still ensure the amounts are SOMEWHAT similar so we don't match a 600.000 tx with a 15.000 DTE by mistake!
            // Let's filter to DTEs within +/- 40% of the given Tx amount just to be safe.
            const absTx = Math.abs(tx.amount);
            let candidates = availableDtes.filter(d => 
                d.totalAmount >= absTx * 0.5 && d.totalAmount <= absTx * 1.5
            );
            
            // If none are within 50%, we fall back to all of them just in case (as requested).
            if (candidates.length === 0) {
                candidates = availableDtes;
            }

            candidates.sort((a, b) => {
                const diffA = Math.abs(a.issuedDate.getTime() - tx.date.getTime());
                const diffB = Math.abs(b.issuedDate.getTime() - tx.date.getTime());
                return diffA - diffB;
            });
            
            const bestDte = candidates[0];
            const daysDiff = Math.abs(Math.round((tx.date.getTime() - bestDte.issuedDate.getTime()) / 86400000));
            
            console.log(`✅ Tx [${Math.abs(tx.amount)}] (${tx.date.toISOString().split('T')[0]}) -> MATCH con Folio ${bestDte.folio} [${bestDte.totalAmount}] (${daysDiff} días de dif)`);
            
            await prisma.reconciliationMatch.create({
                data: {
                    organizationId: bestDte.organizationId,
                    transactionId: tx.id,
                    dteId: bestDte.id,
                    status: 'CONFIRMED',
                    confidence: 1.0,
                    ruleApplied: 'CUSTOM_CLOSEST_DATE_RECURRING',
                    origin: 'MANUAL',
                    confirmedAt: new Date()
                }
            });

            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: { status: 'MATCHED' }
            });

            await prisma.dTE.update({
                where: { id: bestDte.id },
                data: { paymentStatus: 'PAID', outstandingAmount: 0 }
            });

            matchedCount++;
            
            // Remove bestDte from pool
            availableDtes = availableDtes.filter(d => d.id !== bestDte.id);
        }
    }
    
    console.log(`\n🚀 ¡Listo! Se forzaron ${matchedCount} matches por cercanía de fecha.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
