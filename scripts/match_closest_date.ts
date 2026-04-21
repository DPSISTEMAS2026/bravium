import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Matching por Fecha Más Cercana ---');
    
    const targetNames = ['ENTEL', 'SASCO', 'SOUTH AND DESERT'];
    
    // Find providers
    const providers: any[] = [];
    for (const tn of targetNames) {
        const found = await prisma.provider.findMany({
            where: { name: { contains: tn, mode: 'insensitive' } }
        });
        providers.push(...found);
    }
    
    console.log(`Proveedores identificados: ${providers.map(p => p.name).join(', ')}`);

    let matchedCount = 0;

    for (const provider of providers) {
        console.log(`\nProcesando proveedor: ${provider.name}`);
        
        // Unpaid DTEs for this provider
        const dtes = await prisma.dTE.findMany({
            where: { providerId: provider.id, paymentStatus: { not: 'PAID' } },
            orderBy: { issuedDate: 'asc' }
        });
        
        // Unmatched Txs that belong to this provider
        // Either by description or by metadata.providerName
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
            
            // For South and Desert, match parts because of the long name
            if (provUp.includes('SOUTH AND DESERT') && (upDesc.includes('SOUTH') || upDesc.includes('DESERT') || metaProv.includes('SOUTH'))) return true;
            
            // For Entel
            if (provUp.includes('ENTEL') && (upDesc.includes('ENTEL') || metaProv.includes('ENTEL'))) return true;

            // For Sasco
            if (provUp.includes('SASCO') && (upDesc.includes('SASCO') || metaProv.includes('SASCO'))) return true;

            return false;
        });

        let availableTxs = [...txs];
        
        for (const dte of dtes) {
            // Find TXs with exact amount or very close (+/- 50 pesos)
            const candidates = availableTxs.filter(t => Math.abs(Math.abs(t.amount) - dte.totalAmount) <= 100);
            
            if (candidates.length === 0) {
                console.log(`Folio ${dte.folio} [${dte.totalAmount}] -> SIN CANDIDATOS BANCARIOS.`);
                continue;
            }
            
            // Sort to find closes time difference
            candidates.sort((a, b) => {
                const diffA = Math.abs(a.date.getTime() - dte.issuedDate.getTime());
                const diffB = Math.abs(b.date.getTime() - dte.issuedDate.getTime());
                return diffA - diffB;
            });
            
            const bestTx = candidates[0];
            const daysDiff = Math.round(Math.abs(bestTx.date.getTime() - dte.issuedDate.getTime()) / (1000 * 3600 * 24));
            
            console.log(`✅ Folio ${dte.folio} [${dte.totalAmount}] -> MATCH con Tx del ${bestTx.date.toISOString().split('T')[0]} (Diferencia: ${daysDiff} días)`);
            
            // Mark as match in DB
            await prisma.reconciliationMatch.create({
                data: {
                    organizationId: dte.organizationId,
                    transactionId: bestTx.id,
                    dteId: dte.id,
                    status: 'CONFIRMED',
                    confidence: 1.0,
                    ruleApplied: 'CUSTOM_CLOSEST_DATE_RECURRING',
                    origin: 'MANUAL',
                    confirmedAt: new Date()
                }
            });

            await prisma.bankTransaction.update({
                where: { id: bestTx.id },
                data: { status: 'MATCHED' }
            });

            await prisma.dTE.update({
                where: { id: dte.id },
                data: { paymentStatus: 'PAID', outstandingAmount: 0 }
            });

            matchedCount++;
            
            // Remove bestTx from available pool
            availableTxs = availableTxs.filter(t => t.id !== bestTx.id);
        }
    }
    
    console.log(`\n🚀 ¡Listo! Se crearon ${matchedCount} matches por cercanía de fecha.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
