import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function excelDateToJS(serial: number): Date {
    const utcDays = Math.floor(serial - 25569);
    return new Date(utcDays * 86400 * 1000);
}

async function main() {
    // Leer TODAS las pestañas del Excel
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');
    
    const allExcelRows: any[] = [];
    for (const sheetName of workbook.SheetNames) {
        const sheetData = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: "" });
        for (const row of sheetData) {
            allExcelRows.push({ ...row, _sheet: sheetName });
        }
    }
    
    console.log(`Excel tiene ${workbook.SheetNames.length} pestañas: ${workbook.SheetNames.join(', ')}`);
    console.log(`Total filas en todas las pestañas: ${allExcelRows.length}\n`);

    // Obtener transacciones pendientes
    const pendingTxs = await prisma.bankTransaction.findMany({
        where: { status: 'PENDING' },
        orderBy: { date: 'asc' }
    });
    
    console.log(`Transacciones PENDING: ${pendingTxs.length}\n`);

    // Para cada transacción pendiente, buscar en el Excel por monto
    let foundInExcel = 0;
    let notFoundInExcel = 0;
    let foundButNoFolio = 0;
    let foundWithFolioButDteMissing = 0;
    let foundWithFolioAlreadyPaid = 0;
    let foundWithFolioReady = 0;
    let foundWrongAccount = 0;

    const readyToMatch: any[] = [];

    for (const tx of pendingTxs) {
        const absAmount = Math.abs(tx.amount);
        
        // Buscar en Excel todas las filas con ese monto exacto
        const excelMatches = allExcelRows.filter(r => {
            const val = Number(r[' Valor ']);
            return !isNaN(val) && val === absAmount;
        });

        if (excelMatches.length === 0) {
            notFoundInExcel++;
            continue;
        }

        foundInExcel++;

        // Analizar cada fila del Excel que calza por monto
        let hasUsableFolio = false;
        
        for (const exRow of excelMatches) {
            const folioStr = String(exRow['Factura'] || '').trim();
            const folio = parseInt(folioStr);
            const item = String(exRow['Item'] || '').trim();
            const detalle = String(exRow['Detalle'] || '').trim();
            const cuenta = String(exRow['Transferencia Banco / Tarjeta'] || '').trim().toUpperCase();
            const fechaPago = exRow['Fecha de Pago'];
            const fechaStr = typeof fechaPago === 'number' && fechaPago > 40000 
                ? excelDateToJS(fechaPago).toISOString().split('T')[0] 
                : String(fechaPago);

            if (isNaN(folio) || folio <= 0) {
                // No tiene folio - registrar qué tipo de pago es
                if (!hasUsableFolio) {
                    foundButNoFolio++;
                    hasUsableFolio = true; // Para no contar doble
                }
                console.log(`  📋 Tx $${tx.amount} (${tx.date.toISOString().split('T')[0]}) "${tx.description}" → Excel dice: "${item}" / "${detalle}" en pestaña [${exRow._sheet}] SIN FOLIO (cuenta: ${cuenta}, fecha: ${fechaStr})`);
                continue;
            }

            hasUsableFolio = true;

            // Tiene folio - verificar si el DTE existe y su estado
            const dte = await prisma.dTE.findFirst({ where: { folio } });
            if (!dte) {
                foundWithFolioButDteMissing++;
                console.log(`  ⚠️ Tx $${tx.amount} (${tx.date.toISOString().split('T')[0]}) → Excel folio ${folio} pero DTE NO EXISTE en DB`);
                continue;
            }

            if (dte.paymentStatus === 'PAID') {
                foundWithFolioAlreadyPaid++;
                console.log(`  🔒 Tx $${tx.amount} (${tx.date.toISOString().split('T')[0]}) → Excel folio ${folio} pero DTE YA ESTÁ PAGADO`);
                continue;
            }

            // Verificar cuenta bancaria
            let targetAccountId: string | null = null;
            if (cuenta.includes('SANTANDER') && !cuenta.includes('TARJETA') && !cuenta.includes('TC') && !cuenta.includes('DOLARES')) {
                targetAccountId = 'acc-santander-9219882-0';
            } else if (cuenta.includes('TARJETA') || cuenta === 'TARJETA DE CREDITO') {
                targetAccountId = 'acc-santander-5239';
            }

            if (targetAccountId && tx.bankAccountId !== targetAccountId) {
                foundWrongAccount++;
                console.log(`  🔀 Tx $${tx.amount} (${tx.date.toISOString().split('T')[0]}) banco=${tx.bankAccountId} → Excel dice cuenta ${cuenta} (${targetAccountId}), NO COINCIDE`);
                continue;
            }

            foundWithFolioReady++;
            console.log(`  ✅ LISTO PARA MATCH: Tx $${tx.amount} (${tx.date.toISOString().split('T')[0]}) → Folio ${folio} ($${dte.totalAmount}) Estado: ${dte.paymentStatus} Cuenta: ${cuenta}`);
            readyToMatch.push({ tx, dte, exRow });
        }
    }

    console.log('\n==========================================================');
    console.log('  RESUMEN DEL CRUCE EXCEL vs PENDIENTES');
    console.log('==========================================================');
    console.log(`  Total pendientes:                         ${pendingTxs.length}`);
    console.log(`  NO aparecen en Excel por monto:           ${notFoundInExcel}`);
    console.log(`  SÍ aparecen en Excel:                     ${foundInExcel}`);
    console.log(`    - Sin folio (pagos genéricos):           ${foundButNoFolio}`);
    console.log(`    - Con folio pero DTE no existe en DB:    ${foundWithFolioButDteMissing}`);
    console.log(`    - Con folio pero DTE ya está PAGADO:     ${foundWithFolioAlreadyPaid}`);
    console.log(`    - Con folio pero cuenta no coincide:     ${foundWrongAccount}`);
    console.log(`    - LISTOS para match automático:          ${foundWithFolioReady}`);
    console.log('==========================================================');

    if (readyToMatch.length > 0) {
        console.log(`\n¿Quieres que ejecute los ${readyToMatch.length} matches listos? Voy a hacerlo...\n`);
        
        let matched = 0;
        const usedTxIds = new Set<string>();
        const usedDteIds = new Set<string>();
        
        for (const { tx, dte } of readyToMatch) {
            if (usedTxIds.has(tx.id) || usedDteIds.has(dte.id)) continue;

            await prisma.reconciliationMatch.create({
                data: {
                    transactionId: tx.id,
                    dteId: dte.id,
                    organizationId: dte.organizationId,
                    origin: 'MANUAL',
                    status: 'CONFIRMED',
                    confidence: 1.0,
                    ruleApplied: 'EXCEL_DEEP_SCAN',
                    confirmedAt: new Date()
                }
            });
            await prisma.bankTransaction.update({ where: { id: tx.id }, data: { status: 'MATCHED' } });
            await prisma.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'PAID', outstandingAmount: 0 } });
            
            usedTxIds.add(tx.id);
            usedDteIds.add(dte.id);
            matched++;
            console.log(`  ✅ MATCHED: Folio ${dte.folio} ↔ Tx $${tx.amount}`);
        }
        
        console.log(`\n🎉 ${matched} matches nuevos ejecutados.`);
    }

    const finalPending = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    console.log(`\nTransacciones pendientes finales: ${finalPending}`);

    await prisma.$disconnect();
}
main().catch(console.error);
