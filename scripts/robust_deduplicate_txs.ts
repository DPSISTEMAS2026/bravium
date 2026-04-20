import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("--- Iniciando Purgado Robusto de Duplicados (Fintoc/Manual) ---");
    
    // Fetch all transactions to group them
    const txs = await prisma.bankTransaction.findMany({
        include: { matches: true, paymentRecords: true }
    });
    
    // Group by exact date string, amount, and normalized description
    const groups: Record<string, typeof txs> = {};
    
    txs.forEach(tx => {
        const dateStr = tx.date.toISOString().split('T')[0];
        const desc = tx.description.trim().toUpperCase().replace(/\s+/g, ' '); // normalize spaces
        const key = `${dateStr}_${tx.amount}_${desc}`;
        
        if (!groups[key]) groups[key] = [];
        groups[key].push(tx);
    });
    
    let deletedCount = 0;
    let transferredMatches = 0;
    
    for (const [key, group] of Object.entries(groups)) {
        if (group.length <= 1) continue;
        
        // We have duplicates!
        // Rank them to find the Keeper
        group.forEach(t => {
            (t as any).score = 0;
            if (t.origin === 'API_INTEGRATION') (t as any).score += 100; // Prefer Fintoc
            
            const meta = t.metadata as any;
            if (meta?.fintocId) (t as any).score += 50; // Prefer real Fintoc ID
            
            if (t.matches.length > 0) (t as any).score += 10; // Prefer ones that already have matches
            if (t.status === 'MATCHED') (t as any).score += 5;
        });
        
        group.sort((a: any, b: any) => b.score - a.score);
        
        const keeper = group[0];
        const losers = group.slice(1);
        
        console.log(`\nGrupo Duplicado: ${key} (Total: ${group.length})`);
        console.log(` -> KEEPER Elegido: ${keeper.id} (Score: ${(keeper as any).score}, Origin: ${keeper.origin})`);
        
        for (const loser of losers) {
            console.log(` -> Eliminando LOSER: ${loser.id} (Matches: ${loser.matches.length}, Origin: ${loser.origin})`);
            
            // Transfer matches
            if (loser.matches.length > 0) {
                await prisma.reconciliationMatch.updateMany({
                    where: { transactionId: loser.id },
                    data: { transactionId: keeper.id }
                });
                transferredMatches += loser.matches.length;
                console.log(`    - Traspasados ${loser.matches.length} matches al Keeper.`);
            }
            
            // Transfer paymentrecords if any
            if (loser.paymentRecords.length > 0) {
                await prisma.paymentRecord.updateMany({
                    where: { transactionId: loser.id },
                    data: { transactionId: keeper.id }
                });
            }
            
            // If Loser was matched, ensure Keeper carries the status
            if (loser.status === 'MATCHED' || loser.matches.length > 0) {
                await prisma.bankTransaction.update({
                    where: { id: keeper.id },
                    data: { status: 'MATCHED' }
                });
            }
            
            // Delete the Loser
            await prisma.bankTransaction.delete({
                where: { id: loser.id }
            });
            deletedCount++;
        }
    }
    
    console.log(`\n--- RESUMEN FINAL ---`);
    console.log(`Transacciones Duplicadas Eliminadas: ${deletedCount}`);
    console.log(`Matches Traspasados de Forma Segura: ${transferredMatches}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
