import * as xlsx from 'xlsx';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function excelDateToJS(serial: number): Date {
    // Excel serial date to JS Date
    const utcDays = Math.floor(serial - 25569);
    return new Date(utcDays * 86400 * 1000);
}

async function main() {
    console.log('==========================================================');
    console.log('  CONCILIACIÓN INTELIGENTE: BACKUP + EXCEL COMBINADOS');
    console.log('==========================================================\n');

    // ===== CARGAR FUENTES DE VERDAD =====
    const backupDir = 'd:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z';
    const oldMatches: any[] = JSON.parse(fs.readFileSync(`${backupDir}\\bravium_reconciliation_matches.json`, 'utf8'));
    const oldSantanderTxs: any[] = JSON.parse(fs.readFileSync(`${backupDir}\\bravium_santander_cc_transactions.json`, 'utf8'));
    const oldFintocTxs: any[] = JSON.parse(fs.readFileSync(`${backupDir}\\dp_fintoc_transactions.json`, 'utf8'));

    // Mapa de todas las transacciones viejas (Santander + Fintoc)
    const oldTxMap = new Map<string, any>();
    for (const t of [...oldSantanderTxs, ...oldFintocTxs]) oldTxMap.set(t.id, t);

    // Cargar Excel maestro
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');
    let excelRows: any[] = [];
    for (const sheetName of workbook.SheetNames) {
        const sheetData = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: "" });
        excelRows = excelRows.concat(sheetData);
    }

    // ===== CARGAR ESTADO ACTUAL =====
    const allDtes = await prisma.dTE.findMany();
    const dteById = new Map<string, any>();
    const dteByFolio = new Map<number, any>();
    for (const d of allDtes) {
        dteById.set(d.id, d);
        dteByFolio.set(d.folio, d);
    }

    const currentConfirmed = await prisma.reconciliationMatch.findMany({ where: { status: 'CONFIRMED' } });
    const alreadyMatchedDteIds = new Set(currentConfirmed.map(m => m.dteId));
    const alreadyMatchedTxIds = new Set(currentConfirmed.map(m => m.transactionId));

    let pendingTxs = await prisma.bankTransaction.findMany({
        where: { status: 'PENDING' },
        include: { bankAccount: true }
    });

    console.log(`Estado antes: ${pendingTxs.length} transacciones PENDING, ${alreadyMatchedDteIds.size} matches confirmados\n`);

    let restoredFromBackup = 0;
    let matchedFromExcel = 0;
    const usedTxIds = new Set<string>();
    const usedDteIds = new Set<string>();

    // ==================================================================
    // FASE 1: RESTAURAR MATCHES DEL BACKUP
    // ==================================================================
    console.log('--- FASE 1: Restaurando desde BACKUP ---');
    
    const confirmedOldMatches = oldMatches.filter(m => m.status === 'CONFIRMED');
    
    for (const oldMatch of confirmedOldMatches) {
        // Ya esta matched actualmente? Skip
        if (alreadyMatchedDteIds.has(oldMatch.dteId)) continue;
        
        // El DTE existe en la DB actual?
        const dte = dteById.get(oldMatch.dteId);
        if (!dte) continue;
        
        // Ya lo usamos en esta corrida?
        if (usedDteIds.has(dte.id)) continue;

        // Obtener la transaccion vieja del backup
        const oldTx = oldTxMap.get(oldMatch.transactionId);
        if (!oldTx) continue;

        // Buscar una transacción equivalente en la DB actual (mismo monto, misma fecha ~2 días)
        const oldDate = new Date(oldTx.date).getTime();
        const candidates = pendingTxs.filter(t =>
            !alreadyMatchedTxIds.has(t.id) &&
            !usedTxIds.has(t.id) &&
            t.amount === oldTx.amount &&
            Math.abs(new Date(t.date).getTime() - oldDate) <= 3 * 86400000 // 3 días tolerancia
        );

        if (candidates.length === 0) continue;

        // Tomar la más cercana en fecha
        candidates.sort((a, b) =>
            Math.abs(new Date(a.date).getTime() - oldDate) - Math.abs(new Date(b.date).getTime() - oldDate)
        );
        const bestTx = candidates[0];

        // Validar que el proveedor no sea contradictorio (no repetir error de SASCO vs DP SISTEMAS)
        const dteName = ((dte.metadata as any)?.razon_social || '').toLowerCase();
        const txDesc = (bestTx.description || '').toLowerCase();
        const txProv = ((bestTx.metadata as any)?.providerName || '').toLowerCase();
        
        // Si tenemos nombre de proveedor en ambos lados, validar que coincidan mínimamente
        if (dteName.length > 3 && txProv.length > 3) {
            const dteFirstWord = dteName.split(' ')[0];
            if (dteFirstWord.length > 3 && !txProv.includes(dteFirstWord) && !txDesc.includes(dteFirstWord)) {
                // Proveedor no coincide, skip
                continue;
            }
        }

        // ¡Crear el match!
        await prisma.reconciliationMatch.create({
            data: {
                transactionId: bestTx.id,
                dteId: dte.id,
                organizationId: dte.organizationId,
                origin: 'MANUAL',
                status: 'CONFIRMED',
                confidence: oldMatch.confidence || 0.9,
                ruleApplied: `RESTORED_FROM_BACKUP (original: ${oldMatch.ruleApplied || 'unknown'})`,
                confirmedAt: new Date()
            }
        });

        await prisma.bankTransaction.update({ where: { id: bestTx.id }, data: { status: 'MATCHED' } });
        await prisma.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'PAID', outstandingAmount: 0 } });

        usedTxIds.add(bestTx.id);
        usedDteIds.add(dte.id);
        alreadyMatchedDteIds.add(dte.id);
        alreadyMatchedTxIds.add(bestTx.id);
        restoredFromBackup++;

        console.log(`  ✅ BACKUP: Folio ${dte.folio} (${dteName}) → Tx $${bestTx.amount} del ${new Date(bestTx.date).toISOString().split('T')[0]}`);
    }

    console.log(`\nFase 1 completada: ${restoredFromBackup} matches restaurados del backup.\n`);

    // ==================================================================
    // FASE 2: CONCILIAR DESDE EXCEL MAESTRO  
    // ==================================================================
    console.log('--- FASE 2: Conciliando desde EXCEL MAESTRO ---');

    // Refrescar las transacciones pendientes
    pendingTxs = await prisma.bankTransaction.findMany({
        where: { status: 'PENDING' },
        include: { bankAccount: true }
    });

    for (const row of excelRows) {
        const folioStr = String(row['Factura'] || '').trim();
        const folio = parseInt(folioStr);
        if (isNaN(folio) || folio <= 0) continue;

        const valor = Number(row[' Valor ']);
        if (isNaN(valor) || valor <= 0) continue;

        // Determinar la cuenta bancaria
        const cuenta = String(row['Transferencia Banco / Tarjeta'] || '').trim().toUpperCase();
        let targetAccountId: string | null = null;
        if (cuenta.includes('SANTANDER') && !cuenta.includes('TARJETA') && !cuenta.includes('TC') && !cuenta.includes('DOLARES')) {
            targetAccountId = 'acc-santander-9219882-0';
        } else if (cuenta.includes('TARJETA') || cuenta === 'TARJETA DE CREDITO') {
            targetAccountId = 'acc-santander-5239';
        }
        if (!targetAccountId) continue;

        // Buscar el DTE
        const dte = dteByFolio.get(folio);
        if (!dte) continue;
        if (alreadyMatchedDteIds.has(dte.id)) continue;
        if (usedDteIds.has(dte.id)) continue;

        // Fecha de pago del excel
        let payDate: Date | null = null;
        const rawDate = row['Fecha de Pago'];
        if (typeof rawDate === 'number' && rawDate > 40000) {
            payDate = excelDateToJS(rawDate);
        }

        // Buscar transacciones pendientes en esa cuenta con el monto exacto
        const candidates = pendingTxs.filter(t =>
            !usedTxIds.has(t.id) &&
            t.bankAccountId === targetAccountId &&
            Math.abs(t.amount) === valor
        );

        if (candidates.length === 0) continue;

        // Si tenemos fecha de pago del excel, priorizar la más cercana a esa fecha
        let bestTx = candidates[0];
        if (payDate && candidates.length > 1) {
            const payTime = payDate.getTime();
            candidates.sort((a, b) =>
                Math.abs(new Date(a.date).getTime() - payTime) - Math.abs(new Date(b.date).getTime() - payTime)
            );
            bestTx = candidates[0];
        }

        // Validar proveedor si es posible
        const dteName = ((dte.metadata as any)?.razon_social || '').toLowerCase();
        const txProv = ((bestTx.metadata as any)?.providerName || '').toLowerCase();
        const txDesc = (bestTx.description || '').toLowerCase();
        
        if (dteName.length > 3 && txProv.length > 3) {
            const dteFirstWord = dteName.split(' ')[0];
            if (dteFirstWord.length > 3 && !txProv.includes(dteFirstWord) && !txDesc.includes(dteFirstWord)) {
                continue; // Proveedor no coincide
            }
        }

        // Crear match
        await prisma.reconciliationMatch.create({
            data: {
                transactionId: bestTx.id,
                dteId: dte.id,
                organizationId: dte.organizationId,
                origin: 'MANUAL',
                status: 'CONFIRMED',
                confidence: 1.0,
                ruleApplied: 'MATCHED_FROM_EXCEL_MAESTRO',
                confirmedAt: new Date()
            }
        });

        await prisma.bankTransaction.update({ where: { id: bestTx.id }, data: { status: 'MATCHED' } });
        await prisma.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'PAID', outstandingAmount: 0 } });

        usedTxIds.add(bestTx.id);
        usedDteIds.add(dte.id);
        alreadyMatchedDteIds.add(dte.id);
        alreadyMatchedTxIds.add(bestTx.id);
        
        // Quitar de la lista en memoria
        pendingTxs = pendingTxs.filter(t => t.id !== bestTx.id);
        matchedFromExcel++;

        const dateStr = payDate ? payDate.toISOString().split('T')[0] : 'sin fecha';
        console.log(`  ✅ EXCEL: Folio ${folio} ($${valor}) → Tx $${bestTx.amount} del ${new Date(bestTx.date).toISOString().split('T')[0]} (Excel dice: ${dateStr})`);
    }

    console.log(`\nFase 2 completada: ${matchedFromExcel} matches desde Excel maestro.\n`);

    // ===== RESUMEN FINAL =====
    const finalPending = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    const finalMatched = await prisma.reconciliationMatch.count({ where: { status: 'CONFIRMED' } });

    console.log('==========================================================');
    console.log('  RESUMEN FINAL');
    console.log('==========================================================');
    console.log(`  Restaurados del backup:     ${restoredFromBackup}`);
    console.log(`  Cruzados desde Excel:       ${matchedFromExcel}`);
    console.log(`  TOTAL NUEVOS MATCHES:       ${restoredFromBackup + matchedFromExcel}`);
    console.log(`  Matches confirmados ahora:  ${finalMatched}`);
    console.log(`  Transacciones pendientes:   ${finalPending}`);
    console.log('==========================================================');

    await prisma.$disconnect();
}

main().catch(console.error);
