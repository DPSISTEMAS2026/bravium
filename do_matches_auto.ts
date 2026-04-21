import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const ORG_ID = '715545b8-4522-4bb1-be81-3047546c0e8c';

async function restoreFromBackup() {
    console.log('--- RESTAURANDO CONFIRMADOS DESDE EL BACKUP ---');
    const backupDir = 'd:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z';
    const matchesFile = path.join(backupDir, 'bravium_reconciliation_matches.json');
    const ccTxsFile = path.join(backupDir, 'bravium_santander_cc_transactions.json');
    const fintocFile = path.join(backupDir, 'dp_fintoc_transactions.json');

    if (!fs.existsSync(matchesFile)) {
        console.log('No se encontró el backup en:', backupDir);
        return;
    }

    const oldMatches: any[] = JSON.parse(fs.readFileSync(matchesFile, 'utf8'));
    const oldCcTxs: any[] = JSON.parse(fs.readFileSync(ccTxsFile, 'utf8'));
    const oldFintocTxs: any[] = JSON.parse(fs.readFileSync(fintocFile, 'utf8'));

    const allOldTxs = [...oldCcTxs, ...oldFintocTxs];
    const oldTxsMap = new Map(allOldTxs.map(t => [t.id, t]));

    const confirmedDteMatches = oldMatches.filter(m => m.status === 'CONFIRMED' && m.dteId !== null && m.organizationId === ORG_ID);
    console.log(`Encontrados ${confirmedDteMatches.length} matches CONFIRMED tipo DTE en el backup.`);

    // Obtener transacciones actuales no matcheadas (PENDING o PARTIALLY_MATCHED)
    const currentTxs = await prisma.bankTransaction.findMany({
        where: { bankAccount: { organizationId: ORG_ID }, status: { in: ['PENDING', 'PARTIALLY_MATCHED'] } }
    });

    let restoredCount = 0;
    for (const match of confirmedDteMatches) {
        if (!match.dteId) continue;
        const dte = await prisma.dTE.findUnique({ where: { id: match.dteId }, select: { id: true, folio: true, provider: true, paymentStatus: true } });
        if (!dte || dte.paymentStatus === 'PAID') continue; // Si ya está pagado o no existe, ignorar
        
        // Buscar si ya tiene un match CONFIRMED actual
        const existingMatch = await prisma.reconciliationMatch.findFirst({
            where: { dteId: dte.id, status: 'CONFIRMED' }
        });
        if (existingMatch) {
            continue; // Ya migrado?
        }

        if (restoredCount % 10 === 0) console.log(`Progreso: ${restoredCount} restaurados...`);
        const oldTx = oldTxsMap.get(match.transactionId);
        if (!oldTx) continue;

        const oldDate = new Date(oldTx.date);
        
        // Buscar candidato igual en monto, y fecha +- 4 dias
        const candidates = currentTxs.filter(tx => {
            if (tx.amount !== oldTx.amount && tx.amount !== -oldTx.amount) return false;
            const txDate = new Date(tx.date);
            const diffDays = Math.abs((txDate.getTime() - oldDate.getTime()) / (1000 * 3600 * 24));
            return diffDays <= 4;
        });

        if (candidates.length === 1) {
            const targetTx = candidates[0];
            await prisma.reconciliationMatch.create({
                data: {
                    organizationId: ORG_ID,
                    status: 'CONFIRMED',
                    transactionId: targetTx.id,
                    dteId: dte.id,
                    origin: 'MANUAL',
                    confidence: 100
                }
            });
            await prisma.dTE.update({
                where: { id: dte.id },
                data: { paymentStatus: 'PAID', outstandingAmount: 0 }
            });
            await prisma.bankTransaction.update({
                where: { id: targetTx.id },
                data: { status: 'MATCHED' }
            });

            // Removerlo de currentTxs
            const idx = currentTxs.findIndex(t => t.id === targetTx.id);
            if (idx >= 0) currentTxs.splice(idx, 1);
            restoredCount++;
            console.log(`[Backup] Restaurado DTE Folio ${dte.folio} (Prov: ${dte.provider?.name || '?'}) con tx ${targetTx.amount} de la fecha ${targetTx.date}`);
        } else if (candidates.length > 1) {
            // Tie breaker por decripción
            const targetTx = candidates.find(t => t.description.toLowerCase() === oldTx.description.toLowerCase()) || candidates[0];
            await prisma.reconciliationMatch.create({
                data: {
                    organizationId: ORG_ID,
                    status: 'CONFIRMED',
                    transactionId: targetTx.id,
                    dteId: dte.id,
                    origin: 'MANUAL',
                    confidence: 100
                }
            });
            await prisma.dTE.update({
                where: { id: dte.id },
                data: { paymentStatus: 'PAID', outstandingAmount: 0 }
            });
            await prisma.bankTransaction.update({
                where: { id: targetTx.id },
                data: { status: 'MATCHED' }
            });

            // Removerlo de currentTxs
            const idx = currentTxs.findIndex(t => t.id === targetTx.id);
            if (idx >= 0) currentTxs.splice(idx, 1);
            restoredCount++;
            console.log(`[Backup] Restaurado DTE Folio ${dte.folio} (Prov: ${dte.provider?.name || '?'}) con tx ${targetTx.amount} de la fecha ${targetTx.date} (Empate Resuelto)`);
        }
    }
    console.log(`Total restaurados desde backup: ${restoredCount}`);
}

async function restoreFromExcel() {
    console.log('--- RESTAURANDO CONFIRMADOS DESDE EL EXCEL ---');
    // Para no reinventar el parser XLSX con dependencias pesadas si no lo tengo importado.
    // Usaremos un truco simple o lo que hicimos con check_excel_accounts
}

async function main() {
    await restoreFromBackup();
    // Excel next step
    await prisma.$disconnect();
}

main().catch(console.error);
