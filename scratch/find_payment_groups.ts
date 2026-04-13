import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const prisma = new PrismaClient();

function parseAmount(val: string): number {
    if (!val) return 0;
    const cleaned = val.replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '').trim();
    return parseInt(cleaned, 10) || 0;
}

async function main() {
    const filePath = 'd:\\BRAVIUM-PRODUCCION\\Pagos 2026 (1).xlsx';
    const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: true });
    
    // Let's identify "Groups" in the Excel (same date, same bank info, different folios)
    const sheets = ['ENERO 2026', 'FEBRERO 2026', 'MARZO 2026', 'ABRIL 2026'];
    const potentialGroups = new Map<string, any[]>();

    for (const sheetName of sheets) {
        const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });
        for (const row of rows) {
            const folio = row['Factura'];
            if (!folio) continue;
            
            const date = row['Fecha de Pago'];
            const detail = row['Transferencia Banco / Tarjeta'] || '';
            const amount = parseAmount(row[' Valor '] || '');
            
            // Key: date + detail (excluding generic ones like "TRANSFERENCIA")
            if (detail.length > 5) {
                const key = `${date}|${detail}`;
                if (!potentialGroups.has(key)) potentialGroups.set(key, []);
                potentialGroups.get(key)!.push({ folio, amount, empresa: row['Empresa'] || row['Item'], date, sheet: sheetName });
            }
        }
    }

    console.log('--- POTENTIAL MULTI-MATCH GROUPS FOUND IN EXCEL ---\n');
    for (const [key, items] of potentialGroups) {
        if (items.length > 1) {
            console.log(`Group: ${key}`);
            const total = items.reduce((sum, i) => sum + i.amount, 0);
            for (const i of items) {
                console.log(`  - F${i.folio} | $${i.amount} | ${i.empresa}`);
            }
            console.log(`  SUM: $${total}\n`);
            
            // Check if there is a TX in the DB matching this total sum
            const [dDate, dDetail] = key.split('|');
            // Parse date "M/D/YY" to search window
            const dbTx = await prisma.bankTransaction.findFirst({
                where: {
                    amount: -total,
                    status: { in: ['PENDING', 'UNMATCHED', 'PARTIALLY_MATCHED'] }
                }
            });

            if (dbTx) {
                console.log(`  >>> FOUND MATCHING BANK TX: "${dbTx.description}" | $${dbTx.amount} | ${dbTx.date.toISOString().split('T')[0]}\n`);
            }
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
