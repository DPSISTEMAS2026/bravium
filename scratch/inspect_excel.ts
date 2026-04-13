import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface ExcelPayment {
    folio: number;
    amount: number;
    date: string;
    sheet: string;
    rawRow: any;
}

async function main() {
    const filePath = 'd:\\BRAVIUM-PRODUCCION\\Pagos 2026 (1).xlsx';
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    console.log('Sheets found:', workbook.SheetNames);

    const targetSheets = workbook.SheetNames.filter(name => {
        const lower = name.toLowerCase();
        return lower.includes('enero') || lower.includes('febr') || lower.includes('marzo') || lower.includes('abril')
            || lower.includes('jan') || lower.includes('feb') || lower.includes('mar') || lower.includes('apr');
    });

    console.log('Target sheets:', targetSheets.length > 0 ? targetSheets : workbook.SheetNames);
    const sheetsToProcess = targetSheets.length > 0 ? targetSheets : workbook.SheetNames.slice(0, 4);

    // First, let's just see what's in each sheet
    for (const sheetName of sheetsToProcess) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });
        console.log(`\n=== Sheet: "${sheetName}" (${rows.length} rows) ===`);
        if (rows.length > 0) {
            console.log('Columns:', Object.keys(rows[0] as any));
            console.log('Sample rows:');
            for (let i = 0; i < Math.min(3, rows.length); i++) {
                console.log(`  Row ${i}:`, JSON.stringify(rows[i]).slice(0, 300));
            }
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
