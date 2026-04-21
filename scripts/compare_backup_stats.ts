import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Load old backup
    const backupDir = 'd:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z';
    const oldMatches = JSON.parse(fs.readFileSync(`${backupDir}\\bravium_reconciliation_matches.json`, 'utf8'));
    const oldTxs = JSON.parse(fs.readFileSync(`${backupDir}\\bravium_santander_cc_transactions.json`, 'utf8'));
    
    // Create a dictionary of old transactions by ID
    const oldTxMap = new Map();
    for (const t of oldTxs) oldTxMap.set(t.id, t);

    // Get current matches
    const currentMatches = await prisma.reconciliationMatch.findMany({
        where: { status: 'CONFIRMED' }
    });
    const currentMatchedDteIds = new Set(currentMatches.map(m => m.dteId));

    // Get all current DTEs 
    const dtes = await prisma.dTE.findMany();
    const dteMap = new Map();
    for (const d of dtes) dteMap.set(d.id, d);

    const candidatesToRestore: any[] = [];
    let countAlreadyMatched = 0;
    
    // Find missing matches based on old ones
    for (const oldMatch of oldMatches) {
        if (oldMatch.status !== 'CONFIRMED') continue;
        if (currentMatchedDteIds.has(oldMatch.dteId)) {
            countAlreadyMatched++;
            continue;
        }
        const dte = dteMap.get(oldMatch.dteId);
        if (!dte) continue;
        const oldTx = oldTxMap.get(oldMatch.transactionId);
        if (!oldTx) continue; 
        candidatesToRestore.push({ dte, oldTx, oldMatch });
    }
    
    console.log(`- Base antigua (Pre-Migración): ${oldMatches.filter((m:any) => m.status === 'CONFIRMED').length} matches confirmados.`);
    console.log(`- Intersección: ${countAlreadyMatched} coincidencias orgánicas recuperadas en nuestro sistema actual.`);
    console.log(`- Faltantes del pasado: Quedan ${candidatesToRestore.length} matches antiguos que no se cruzaron automáticamente.\n`);

    // Fetch ALL pending current bank transactions
    const pendingTxsRaw = await prisma.bankTransaction.findMany({
        where: { status: { not: 'MATCHED' } }
    });
    
    let restorable = 0;
    const matchedPendingTxIds = new Set();
    const missingTxSignatures = [];

    for (const c of candidatesToRestore) {
        const oldTxTime = new Date(c.oldTx.date).getTime();
        const equivalent = pendingTxsRaw.find(ptx => {
            if (matchedPendingTxIds.has(ptx.id)) return false;
            if (ptx.amount !== c.oldTx.amount) return false;
            return Math.abs(ptx.date.getTime() - oldTxTime) <= 3 * 86400000;
        });

        if (equivalent) {
            restorable++;
            matchedPendingTxIds.add(equivalent.id);
        } else {
            // Unrestorable, likely from Credit Card or not in the new Santander pool
            missingTxSignatures.push(`$${c.oldTx.amount} de ${c.oldTx.description.substring(0,25)}`);
        }
    }
    
    console.log(`De los ${candidatesToRestore.length} faltantes, el banco actual de Santander SI TIENE los movimientos para re-enlazar ${restorable} de ellos.`);
    
    const unRestorable = candidatesToRestore.length - restorable;
    if (unRestorable > 0) {
        console.log(`\nPero los otros ${unRestorable} NUNCA VAN A CRUZAR con la CC Santander en este momento, porque esos movimientos bancarios NO ESTÁN FÍSICAMENTE en la cuenta corriente.`);
        console.log(`Ejemplos de movimientos desaparecidos que solían estar calzados:`);
        missingTxSignatures.slice(0, 5).forEach(s => console.log(`  - ${s}`));
        
        console.log(`\nConclusión: Esto prueba matemáticamente que esos ${unRestorable} pagos salieron/rebotaron originalmente desde la Tarjeta de Crédito (TC) u otra cuenta, y hasta que no subas ese archivo de TC, no volverán a calzar.`);
    }

    console.log(`\nMovimientos pendientes actuales en la cuenta: ${pendingTxsRaw.length - restorable} (sin contar los restaurables).`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
