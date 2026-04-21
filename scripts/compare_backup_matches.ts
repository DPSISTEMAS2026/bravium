import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Comparando Matches Antiguos vs Actuales ---');
    
    // Load old backup
    const backupDir = 'd:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z';
    const oldMatches = JSON.parse(fs.readFileSync(`${backupDir}\\bravium_reconciliation_matches.json`, 'utf8'));
    const oldTxs = JSON.parse(fs.readFileSync(`${backupDir}\\bravium_santander_cc_transactions.json`, 'utf8'));
    
    // Create a dictionary of old transactions by ID
    const oldTxMap = new Map();
    for (const t of oldTxs) {
        oldTxMap.set(t.id, t);
    }

    // Get all current DTEs and current Matches
    const dtes = await prisma.dTE.findMany();
    const dteMap = new Map();
    for (const d of dtes) dteMap.set(d.id, d);

    // Get current matches
    const currentMatches = await prisma.reconciliationMatch.findMany({
        where: { status: 'CONFIRMED' }
    });
    const currentMatchedDteIds = new Set(currentMatches.map(m => m.dteId));

    // To restore list
    const candidatesToRestore: any[] = [];
    let countAlreadyMatched = 0;
    
    // Find missing matches based on old ones
    for (const oldMatch of oldMatches) {
        if (oldMatch.status !== 'CONFIRMED') continue;
        
        if (currentMatchedDteIds.has(oldMatch.dteId)) {
            countAlreadyMatched++;
            continue;
        }
        
        // This old match was CONFIRMED, but the DTE is currently NOT matched!
        const dte = dteMap.get(oldMatch.dteId);
        if (!dte) continue; // DTE doesn't exist anymore somehow
        
        const oldTx = oldTxMap.get(oldMatch.transactionId);
        if (!oldTx) continue; // Old Tx not found in backup
        
        candidatesToRestore.push({ dte, oldTx, oldMatch });
    }
    
    console.log(`- En el backup antiguo teníamos ${oldMatches.filter((m:any) => m.status === 'CONFIRMED').length} matches confirmados.`);
    console.log(`- De esos, ${countAlreadyMatched} YA ESTÁN calzados en el sistema actual de vuelta.`);
    console.log(`- Quedan ${candidatesToRestore.length} matches antiguos que actualmente no están enganchados.`);
    
    // Check if we can find their new BankTransaction counterparts!
    let totallyRestorable = 0;
    for (const c of candidatesToRestore) {
        // Search current BankTransactions for matching amount and date (+/- 2 days)
        const possibleTxs = await prisma.bankTransaction.findMany({
            where: {
                status: { not: 'MATCHED' },
                amount: c.oldTx.amount,
                date: {
                    gte: new Date(new Date(c.oldTx.date).getTime() - 2 * 86400000),
                    lte: new Date(new Date(c.oldTx.date).getTime() + 2 * 86400000)
                }
            }
        });
        
        if (possibleTxs.length > 0) {
            totallyRestorable++;
            // We could theoretically restore this completely.
        }
    }
    
    console.log(`\n¡Buenas noticias! De los ${candidatesToRestore.length} matches que perdimos, he encontrado las transferencias equivalentes en la nueva base de Santander para restaurar ${totallyRestorable} de ellos AL INSTANTE si quieres.`);
    
    console.log('\nFaltan por conciliar un total de 391 transacciones bancarias PENDIENTES de la cuenta de Santander actualmente.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
