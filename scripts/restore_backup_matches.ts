import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- RESTAURANDO 12 MATCHES HISTÓRICOS DESDE EL BACKUP ---');

    const backupDir = 'd:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z';
    const oldMatchesFile = `${backupDir}\\bravium_reconciliation_matches.json`;
    const oldTxFile = `${backupDir}\\bravium_santander_cc_transactions.json`;

    if (!fs.existsSync(oldMatchesFile) || !fs.existsSync(oldTxFile)) {
        console.error('Backup files missing');
        return;
    }

    const oldMatches = JSON.parse(fs.readFileSync(oldMatchesFile, 'utf8'));
    const oldTxsArr = JSON.parse(fs.readFileSync(oldTxFile, 'utf8'));

    const oldMatchByTx = new Map();
    for (const m of oldMatches) {
        if (m.status === 'CONFIRMED' || m.status === 'ACCEPTED') {
            oldMatchByTx.set(m.transactionId, m);
        }
    }

    const pendingTxs = await prisma.bankTransaction.findMany({
        where: { status: 'PENDING', date: { gte: new Date('2026-01-01T00:00:00.000Z') } }
    });

    let restored = 0;

    for (const currentTx of pendingTxs) {
        const oldTx = oldTxsArr.find((t: any) => 
            Math.abs(t.amount) === Math.abs(currentTx.amount) &&
            new Date(t.date).toISOString().substring(0,10) === currentTx.date.toISOString().substring(0,10)
        );

        if (oldTx) {
            const oldMatch = oldMatchByTx.get(oldTx.id);
            if (oldMatch) {
                const dte = await prisma.dTE.findUnique({ where: { id: oldMatch.dteId } });
                
                if (dte) {
                   // Restaurar
                   await prisma.$transaction(async (tx) => {
                       await tx.reconciliationMatch.create({
                           data: {
                               organizationId: dte.organizationId,
                               transactionId: currentTx.id,
                               dteId: dte.id,
                               status: 'CONFIRMED',
                               confidence: 1.0,
                               ruleApplied: 'RESTORE_FROM_BACKUP',
                               origin: 'MANUAL',
                               confirmedAt: new Date()
                           }
                       });

                       await tx.bankTransaction.update({
                           where: { id: currentTx.id },
                           data: { status: 'MATCHED' }
                       });

                       // Solo actualizar el DTE si sigue UNPAID o PARTIAL
                       if (dte.paymentStatus !== 'PAID') {
                           await tx.dTE.update({
                               where: { id: dte.id },
                               data: { paymentStatus: 'PAID', outstandingAmount: 0 }
                           });
                       }
                   });

                   console.log(`✅ Restaurado: Tx $${currentTx.amount} -> DTE Folio ${dte.folio}`);
                   restored++;
                }
            }
        }
    }

    console.log(`\n🎉 Procedimiento finalizado. Se restauraron ${restored} matches a la fuerza.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
