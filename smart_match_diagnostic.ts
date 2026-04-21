import * as xlsx from 'xlsx';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // ===== PARTE 1: LEER EXCEL MAESTRO =====
    console.log('=== LEYENDO EXCEL MAESTRO ===');
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');
    
    let rawData: any[] = [];
    for (const sheetName of workbook.SheetNames) {
        const sheetData = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: "" });
        rawData = rawData.concat(sheetData);
    }
    
    // Mostrar columnas del Excel
    if (rawData.length > 0) {
        console.log('Columnas Excel:', Object.keys(rawData[0]));
        console.log('Muestra fila 1:', JSON.stringify(rawData[0]));
        console.log('Muestra fila 2:', JSON.stringify(rawData[1]));
        console.log('Muestra fila 3:', JSON.stringify(rawData[2]));
    }
    console.log(`Total filas Excel: ${rawData.length}`);

    // ===== PARTE 2: LEER BACKUP =====
    console.log('\n=== LEYENDO BACKUP ===');
    const backupDir = 'd:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z';
    const oldMatches = JSON.parse(fs.readFileSync(`${backupDir}\\bravium_reconciliation_matches.json`, 'utf8'));
    const oldTxs = JSON.parse(fs.readFileSync(`${backupDir}\\bravium_santander_cc_transactions.json`, 'utf8'));
    const oldFintocTxs = JSON.parse(fs.readFileSync(`${backupDir}\\dp_fintoc_transactions.json`, 'utf8'));
    
    console.log(`Backup matches: ${oldMatches.length} (CONFIRMED: ${oldMatches.filter((m:any) => m.status === 'CONFIRMED').length})`);
    console.log(`Backup Santander Txs: ${oldTxs.length}`);
    console.log(`Backup Fintoc Txs: ${oldFintocTxs.length}`);
    
    if (oldMatches.length > 0) {
        console.log('Muestra match:', JSON.stringify(oldMatches[0]));
    }
    if (oldTxs.length > 0) {
        console.log('Muestra Santander Tx:', JSON.stringify(oldTxs[0]));
    }

    // ===== PARTE 3: ESTADO ACTUAL DE LA DB =====
    console.log('\n=== ESTADO ACTUAL DB ===');
    const currentMatches = await prisma.reconciliationMatch.findMany({ where: { status: 'CONFIRMED' } });
    const pendingTxs = await prisma.bankTransaction.findMany({ where: { status: 'PENDING' } });
    const unpaidDtes = await prisma.dTE.findMany({ where: { paymentStatus: { not: 'PAID' } } });
    
    console.log(`Matches confirmados actuales: ${currentMatches.length}`);
    console.log(`Transacciones PENDING: ${pendingTxs.length}`);
    console.log(`DTEs no pagados: ${unpaidDtes.length}`);
    
    // Cuales DTEs estaban matched en el backup pero ahora no?
    const currentMatchedDteIds = new Set(currentMatches.map(m => m.dteId));
    const backupConfirmedDteIds = new Set(oldMatches.filter((m:any) => m.status === 'CONFIRMED').map((m:any) => m.dteId as string));
    
    let lostFromBackup = 0;
    for (const dteId of Array.from(backupConfirmedDteIds)) {
        if (!currentMatchedDteIds.has(dteId as string)) lostFromBackup++;
    }
    console.log(`\nDTEs que estaban CONFIRMED en backup pero NO están matched ahora: ${lostFromBackup}`);

    await prisma.$disconnect();
}
main().catch(console.error);
