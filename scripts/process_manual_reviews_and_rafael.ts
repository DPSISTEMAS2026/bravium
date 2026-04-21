import * as fs from 'fs';
import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getExcelDate(excelDate: any) {
    if (typeof excelDate === 'number') {
        return new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    }
    return new Date(excelDate);
}

function normalizeDateStr(d: Date) {
    return d.toISOString().substring(0, 10);
}

async function main() {
    console.log('--- 1. RESTAURANDO REVISIONES MANUALES DEL BACKUP ---');

    const backupDir = 'd:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z';
    const oldTxFile = `${backupDir}\\bravium_santander_cc_transactions.json`;
    
    const oldTxsArr = JSON.parse(fs.readFileSync(oldTxFile, 'utf8'));
    
    // Solo consideramos los que tenían nota (ej: 'sin factura', gastos fijos revisados, etc)
    const oldReviewedTxs = oldTxsArr.filter((t: any) => t.metadata && t.metadata.reviewNote);

    const pendingTxs = await prisma.bankTransaction.findMany({
        where: { status: 'PENDING' }
    });

    let recoveredComments = 0;
    
    // Diccionario temporal para guardar las tx actuales que ya hayamos matcheado
    const usedTxIds = new Set();

    for (const currentTx of pendingTxs) {
        // Encontrar una trx en el backup que sea indentica
        const oldTx = oldReviewedTxs.find((t: any) => 
            Math.abs(t.amount) === Math.abs(currentTx.amount) &&
            new Date(t.date).toISOString().substring(0,10) === currentTx.date.toISOString().substring(0,10)
        );

        if (oldTx) {
            const currentMetadata = typeof currentTx.metadata === 'object' && currentTx.metadata ? currentTx.metadata : {};
            await prisma.bankTransaction.update({
                where: { id: currentTx.id },
                data: {
                    status: 'MATCHED',
                    metadata: {
                        ...currentMetadata,
                        reviewNote: oldTx.metadata.reviewNote,
                        providerName: oldTx.metadata.providerName,
                        restoredFromBackup: true
                    }
                }
            });
            usedTxIds.add(currentTx.id);
            recoveredComments++;
            console.log(`✅ Nota Restaurada: Tx $${currentTx.amount} -> "${oldTx.metadata.reviewNote}" (Prov: ${oldTx.metadata.providerName || 'N/A'})`);
        }
    }
    
    console.log(`\n Total de comentarios/revisiones de Backup restaurados: ${recoveredComments}`);

    console.log('\n--- 2. PROCESANDO BOLETAS HONORARIOS: RAFAEL FUENTES (DESDE EXCEL) ---');
    const wb = xlsx.readFile('d:/BRAVIUM-PRODUCCION/scripts/Pagos 2026 (3) (1).xlsx');
    
    // Parsear el excel para obtener la lista de pagos de Rafael de todos los meses
    const rafaelExcelRows: {date: string, amount: number, boleta: string}[] = [];

    const sheets = ['ENERO 2026', 'FEBRERO 2026', 'MARZO 2026', 'ABRIL 2026'];
    for (const s of sheets) {
        const rows = xlsx.utils.sheet_to_json(wb.Sheets[s], {defval: ''});
        for (const r of rows as any[]) {
            const item = String(r['Empresa'] || r['Item']).toLowerCase();
            if (item.includes('rafael fuente')) {
                // Hay varias columnas que pueden tener el valor
                const valor = Number(r[' Valor '] || r['                  '] || r[' Revision ']);
                const boletaVal = r['Boleta\u00A0'] || r['Boleta'] || r['Boleta '];
                const dateVal = r['Fecha de Pago'] || r['Fecha Pago'];
                
                if (boletaVal && valor === 300000 && dateVal) {
                    rafaelExcelRows.push({
                        date: normalizeDateStr(getExcelDate(dateVal)),
                        amount: valor,
                        boleta: String(boletaVal)
                    });
                }
            }
        }
    }

    console.log(`Boletas de Rafael encontradas en el Excel: ${rafaelExcelRows.length}`);

    // Solo quedan las tx que NO hayan sido marcadas en el paso anterior
    const pendingRafaTxs = await prisma.bankTransaction.findMany({
        where: { 
            status: 'PENDING',
            description: { contains: 'rafael fuentes', mode: 'insensitive' }
        }
    });
    
    let rafaCategorized = 0;

    for (const tx of pendingRafaTxs) {
        if (usedTxIds.has(tx.id)) continue; // Por si acaso

        const txDateStr = normalizeDateStr(tx.date);
        
        // Buscar The closest row by Date (sometimes bank transfers vary by 1 or 2 days from the excel)
        let exactRow = rafaelExcelRows.find(r => r.date === txDateStr && !r['_used']);
        
        if (!exactRow) {
            // Fuzzy search by 1-3 days leeway if needed, but for now exact or closest within 3 days.
            const txTime = tx.date.getTime();
            exactRow = rafaelExcelRows.filter(r => !r['_used']).sort((a,b) => {
                const aD = new Date(a.date).getTime();
                const bD = new Date(b.date).getTime();
                return Math.abs(aD - txTime) - Math.abs(bD - txTime);
            })[0];
        }

        if (exactRow) {
            (exactRow as any)['_used'] = true;
            
            const currentMetadata = typeof tx.metadata === 'object' && tx.metadata ? tx.metadata : {};
            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: {
                    status: 'MATCHED',
                    metadata: {
                        ...currentMetadata,
                        reviewNote: `Boleta Honorarios N° ${exactRow.boleta}`,
                        providerName: 'RAFAEL FUENTES',
                        autoCategorized: true
                    }
                }
            });
            console.log(`👨‍🔧 Rafael Asignado: Tx $${tx.amount} (${txDateStr}) -> Asociado a Boleta N° ${exactRow.boleta} (Excel Date: ${exactRow.date})`);
            rafaCategorized++;
        }
    }

    console.log(`\n🎉 Procedimiento finalizado. Transferencias a Rafael mapeadas: ${rafaCategorized}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
