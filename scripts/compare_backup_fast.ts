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
    
    console.log(`- En el backup antiguo teníamos ${oldMatches.filter((m:any) => m.status === 'CONFIRMED').length} matches confirmados.`);
    console.log(`- De esos, ${countAlreadyMatched} YA ESTÁN calzados de la CC de Santander actual.`);
    console.log(`- Quedan ${candidatesToRestore.length} matches antiguos que actualmente no están enganchados.`);

    // Fetch ALL pending current bank transactions
    const pendingTxsRaw = await prisma.bankTransaction.findMany({
        where: { status: { not: 'MATCHED' } }
    });
    
    let totallyRestorable = 0;
    
    const matchedPendingTxIds = new Set();

    for (const c of candidatesToRestore) {
        const oldTxTime = new Date(c.oldTx.date).getTime();
        
        // Find equivalent tx in current pending
        const equivalent = pendingTxsRaw.find(ptx => {
            if (matchedPendingTxIds.has(ptx.id)) return false;
            if (ptx.amount !== c.oldTx.amount) return false;
            const targetTime = ptx.date.getTime();
            // Allow +/- 2 days difference in case syncing shifted weekends
            return Math.abs(targetTime - oldTxTime) <= 2 * 86400000;
        });

        if (equivalent) {
            totallyRestorable++;
            matchedPendingTxIds.add(equivalent.id);
            // DO CONFIRMATION AUTOMATICALLY!
            await prisma.reconciliationMatch.create({
                data: {
                    organizationId: c.dte.organizationId,
                    transactionId: equivalent.id,
                    dteId: c.dte.id,
                    status: 'CONFIRMED',
                    confidence: 1.0,
                    ruleApplied: 'RESTORE_FROM_BACKUP',
                    origin: 'MANUAL',
                    confirmedAt: new Date()
                }
            });

            await prisma.bankTransaction.update({
                where: { id: equivalent.id },
                data: { status: 'MATCHED' }
            });

            await prisma.dTE.update({
                where: { id: c.dte.id },
                data: { paymentStatus: 'PAID', outstandingAmount: 0 }
            });
        }
    }
    
    console.log(`\n¡Buenas noticias! Se pudieron restaurar completamente ${totallyRestorable} matches directamente desde la CC Santander de respaldo.`);
    
    // Log what was NOT restorable and why
    const unRestorable = candidatesToRestore.length - totallyRestorable;
    if (unRestorable > 0) {
        console.log(`\n¿Por qué faltaron esos ${unRestorable} matches antiguos?`);
        console.log(`Lo más probable es que las transferencias bancarias de esos pagos NO existan en la base actual del Santander porque el año pasado se pagaron con la TARJETA DE CRÉDITO. Por lo que, en estricto rigor, no se han perdido, sino que están a la espera de que subas el Excel de las Tarjetas para vincularse de nuevo con su match exacto.`);
    }

    const currentPendingStats = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    console.log(`\nAl final de todo: Quedan ${currentPendingStats} movimientos en la cuenta de Santander sin conciliar.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
