import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseDate(dateStr: string) {
    const [d, m, y] = dateStr.split('/');
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0); 
}

async function main() {
    console.log('--- Importando Excel TC ---');
    const file = 'd:\\BRAVIUM-PRODUCCION\\scripts\\Ultimos movimientos_nac16_04_2026 (1).xlsm';
    const wb = xlsx.readFile(file);
    const data = xlsx.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    
    // Find header
    let headerIdx = -1;
    for (let i = 0; i < data.length; i++) {
        if (data[i][0] === 'FECHA') {
            headerIdx = i;
            break;
        }
    }

    if (headerIdx === -1) throw new Error('No se encontró cabecera FECHA');

    const tcAccountId = 'acc-santander-5239';
    const validTxs = [];

    // Rows below header
    for (let i = headerIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 4 || !row[0]) continue;
        if (typeof row[0] !== 'string') continue;

        const dateStr = row[0]; // FECHA
        const est = row[1]; // ESTABLECIMIENTO
        const desc = row[2]; // DESCRIPCIÓN
        const amount = typeof row[3] === 'number' ? row[3] : parseInt(String(row[3]).replace(/\./g, ''));

        if (!est || !amount) continue;

        // Skip debt payments
        if (est.includes('MONTO CANCELADO') || desc.includes('PAGO DE DEUDA')) continue;

        // Debits are negative in our DB
        const finalAmount = -Math.abs(amount);

        validTxs.push({
            id: `tc-excel-${dateStr.replace(/\//g,'')}-${Math.abs(finalAmount)}-${Math.random().toString(36).substr(2, 5)}`,
            bankAccountId: tcAccountId,
            type: finalAmount < 0 ? 'DEBIT' : 'CREDIT',
            amount: finalAmount,
            date: parseDate(dateStr),
            description: est.trim(), // Use Establecimiento since it has the real name!!!
            status: 'PENDING',
            metadata: { source: 'EXCEL_ULTIMOS_MOV', originalDescription: desc }
        });
    }

    console.log(`Encontradas ${validTxs.length} transacciones en el Excel.`);

    let imported = 0;
    for (const tx of validTxs) {
        // Evitar duplicados (por monto exacto y ventana de 2 dias)
         const exists = await prisma.bankTransaction.findFirst({
             where: {
                 bankAccountId: tcAccountId,
                 amount: tx.amount,
                 description: tx.description,
                 date: {
                    gte: new Date(tx.date.getTime() - 86400000 * 2),
                    lte: new Date(tx.date.getTime() + 86400000 * 2)
                 }
             }
         });
         
         if (!exists) {
             await prisma.bankTransaction.create({ data: tx });
             imported++;
         }
    }

    console.log(`✅ Importación completada. Insertadas ${imported} nuevas transacciones de TC.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
