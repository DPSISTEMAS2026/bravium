import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Buscando Proveedor ---');
    const providers = await prisma.provider.findMany({
        where: { name: { contains: 'SOUTH AND DESERT', mode: 'insensitive' } }
    });
    console.log('Proveedores encontrados:', providers.map(p => ({ id: p.id, name: p.name, rut: p.rut })));
    
    if (providers.length === 0) {
        console.log('No se encontro el proveedor.');
        return;
    }
    
    const provider = providers[0];
    
    console.log('\n--- Buscando DTEs (2026) ---');
    const dtes = await prisma.dTE.findMany({
        where: { 
            providerId: provider.id,
            issuedDate: { gte: new Date('2026-01-01'), lte: new Date('2026-12-31') }
        },
        include: {
            matches: {
                include: {
                    transaction: true
                }
            }
        },
        orderBy: { issuedDate: 'asc' }
    });
    
    console.log(`DTEs encontrados en 2026: ${dtes.length}`);
    
    // Fetch transactions containing provider name or matched to this provider
    const txs = await prisma.bankTransaction.findMany({
        where: {
            date: { gte: new Date('2026-01-01'), lte: new Date('2026-12-31') },
            OR: [
                { description: { contains: 'SOUTH', mode: 'insensitive' } },
                { description: { contains: 'DESERT', mode: 'insensitive' } },
                { matches: { some: { dte: { providerId: provider.id } } } }
            ]
        },
        include: { matches: { include: { dte: true } } },
        orderBy: { date: 'asc' }
    });
    console.log(`\nBankTransactions encontradas (o vinculadas) en 2026: ${txs.length}\n`);

    console.log('--- ESTADO DE MATCHINGS ACTUAL PARA DTEs ---');
    dtes.forEach(dte => {
        let confMatch = dte.matches?.find((m: any) => m.status === 'CONFIRMED');
        let confTx = confMatch?.transaction;
        console.log(`DTE Folio: ${dte.folio.toString().padEnd(6)} | Monto: ${dte.totalAmount.toString().padEnd(8)} | Fecha: ${dte.issuedDate.toISOString().split('T')[0]}  =>  ${confTx ? `[MATCH ACTUAL] Tx: ${Math.abs(confTx.amount)} del ${confTx.date.toISOString().split('T')[0]}` : '[SIN MATCH]'}`);
    });
    
    console.log('\n--- PROPUESTA DE NUEVO MATCHING (Por Monto Exacto y Fecha Más Cercana) ---');
    
    // Copy the available transactions
    let availableTxs = [...txs];
    
    const proposedMatches: any[] = [];
    
    for (const dte of dtes) {
        // Find transactions with same amount
        const amountCands = availableTxs.filter(t => Math.abs(t.amount) === dte.totalAmount);
        
        if (amountCands.length === 0) {
            proposedMatches.push({ dte, tx: null });
            continue;
        }
        
        // Find closest date
        let closestTx = amountCands[0];
        let minDiff = Math.abs(closestTx.date.getTime() - dte.issuedDate.getTime());
        
        for(let i=1; i<amountCands.length; i++) {
            const diff = Math.abs(amountCands[i].date.getTime() - dte.issuedDate.getTime());
            if (diff < minDiff) {
                minDiff = diff;
                closestTx = amountCands[i];
            }
        }
        
        proposedMatches.push({ dte, tx: closestTx });
        // Remove the matched tx from available pool to avoid duplicate matching
        availableTxs = availableTxs.filter(t => t.id !== closestTx.id);
    }
    
    proposedMatches.forEach(m => {
        if (!m.tx) {
            console.log(`❌ Folio: ${m.dte.folio.toString().padEnd(6)} (${m.dte.issuedDate.toISOString().split('T')[0]}) [${m.dte.totalAmount}] --> SIN TX EQUIVALENTE ENCONTRADA`);
        } else {
            console.log(`✅ Folio: ${m.dte.folio.toString().padEnd(6)} (${m.dte.issuedDate.toISOString().split('T')[0]}) [${m.dte.totalAmount}] --> MATCH CERCANO: Tx del ${m.tx.date.toISOString().split('T')[0]} (Diferencia: ${Math.round(Math.abs(m.tx.date.getTime() - m.dte.issuedDate.getTime()) / (1000 * 3600 * 24))} días)`);
        }
    });

}

main().catch(console.error).finally(() => prisma.$disconnect());
