import * as xlsx from 'xlsx';
import { PrismaClient, TransactionType, MatchStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- BARRIDA FINAL CON EXCEL MAESTRO ---');
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');
    
    let rawData = [];
    for (const sheetName of workbook.SheetNames) {
        console.log(`Leyendo pestaña: ${sheetName}`);
        const sheetData = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: "" });
        rawData = rawData.concat(sheetData);
    }

    let countExcelMatches = 0;
    
    // Create mapping of Folios in Excel
    const excelEntries = [];
    for (const row of rawData) {
        const cuenta = String(row['Transferencia Banco / Tarjeta'] || '').trim().toUpperCase();
        let targetAccountId = null;
        if (cuenta.includes('SANTANDER') || cuenta === 'TRANSFERENCIA CUENTA SANTANDER') {
            if (cuenta.includes('SANTANDER') && !cuenta.includes('TARJETA') && !cuenta.includes('TC') && !cuenta.includes('DOLARES')) {
                targetAccountId = 'acc-santander-9219882-0';
            } else if (cuenta.includes('TARJETA') || cuenta === 'TARJETA DE CREDITO') {
                targetAccountId = 'acc-santander-5239';
            }
        } else if (cuenta === 'TARJETA DE CREDITO') {
            targetAccountId = 'acc-santander-5239';
        }
        
        if (!targetAccountId) continue;
        const folio = String(row['Factura']).trim();
        const valor = Number(row[' Valor ']);
        if (!folio || isNaN(valor) || valor <= 0) continue;

        excelEntries.push({ folio, amount: valor, accountId: targetAccountId });
    }

    console.log(`Leídos ${excelEntries.length} registros del Excel con cuenta asignada.`);

    // Obtener todos los DTE no pagados
    const pendingDtes = await prisma.dTE.findMany({
        where: { paymentStatus: { not: 'PAID' }, outstandingAmount: { gt: 0 } }
    });
    
    const dteByFolio = new Map();
    for (const d of pendingDtes) {
        dteByFolio.set(String(d.folio), d);
    }

    // Obtener transacciones PENDIENTES
    let pendingTxs = await prisma.bankTransaction.findMany({
        where: { status: 'PENDING' }
    });

    for (const entry of excelEntries) {
        const dte = dteByFolio.get(entry.folio);
        if (!dte) continue; // Ya pagado o no cargado en sistema

        // Buscar transaccion en la cuenta pedida, con ese monto exacto
        const possibleTxs = pendingTxs.filter(t => 
            t.bankAccountId === entry.accountId && 
            Math.abs(t.amount) === entry.amount
        );

        if (possibleTxs.length >= 1) {
             // Si hay mas de 1, tomar la de fecha más parecida
             let bestTx = possibleTxs[0];
             if (possibleTxs.length > 1) {
                 possibleTxs.sort((a,b) => 
                     Math.abs(a.date.getTime() - dte.issuedDate.getTime()) - 
                     Math.abs(b.date.getTime() - dte.issuedDate.getTime())
                 );
                 bestTx = possibleTxs[0];
             }

             // Realizar Match
             await prisma.reconciliationMatch.create({
                 data: {
                     organizationId: dte.organizationId,
                     transactionId: bestTx.id,
                     dteId: dte.id,
                     status: 'CONFIRMED',
                     confidence: 1.0,
                     ruleApplied: 'FORCED_BY_MASTER_EXCEL',
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

             console.log(`✅ EXCEL MATCH FORCE: DTE Folio ${dte.folio} con Tx $${bestTx.amount} (ID: ${bestTx.id.substring(0,6)})`);
             
             // Quitar de la lista en memoria para no reusarlo
             pendingTxs = pendingTxs.filter(t => t.id !== bestTx.id);
             countExcelMatches++;
        }
    }

    console.log(`\n🎉 Barrida final completada. Se forzaron e inyectaron ${countExcelMatches} matches exactos provenientes del Excel.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
