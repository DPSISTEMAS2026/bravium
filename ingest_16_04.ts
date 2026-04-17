import { PrismaClient, TransactionStatus } from '@prisma/client';
import * as xlsx from 'xlsx';

const prisma = new PrismaClient();

async function main() {
    const filePath = 'd:\\BRAVIUM-PRODUCCION\\Ultimos movimientos_nac16_04_2026.xlsx';
    console.log(`Reading from: ${filePath}`);
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Parse everything as a 2D array
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    let headerRowIdx = -1;
    for (let i = 0; i < data.length; i++) {
        const row = data[i] as any[];
        if (row && row.length > 0 && String(row[0]).toUpperCase() === 'FECHA') {
            headerRowIdx = i;
            break;
        }
    }
    
    if (headerRowIdx === -1) throw new Error("Could not find FECHA row in Excel");

    const rows = data.slice(headerRowIdx + 1);
    console.log(`Found ${rows.length} rows to process after header.`);
    
    let inserted = 0;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as any[];
        if (!row || row.length < 4 || !row[0]) continue;
        
        const fechaStr = String(row[0]).trim();
        if (fechaStr === 'nan' || fechaStr === '' || fechaStr.toLowerCase() === 'nan' || fechaStr.startsWith('Total')) continue;

        const dateParts = fechaStr.split('/');
        if (dateParts.length !== 3) continue;

        const dateObj = new Date(parseInt(dateParts[2]), parseInt(dateParts[1]) - 1, parseInt(dateParts[0]), 12, 0, 0);
        
        const description = (String(row[1] || '') + ' ' + String(row[2] || '')).trim();
        const amountStr = String(row[3]).replace(/[\.\$]/g, '').trim(); // Replaced dollars just in case
        if (!amountStr || isNaN(parseInt(amountStr))) continue;
        const amount = parseInt(amountStr);
        
        const dbAmount = -amount;

        const transactionId = `TC-${dateObj.toISOString().split('T')[0]}-${dbAmount}-${description.substring(0,25).replace(/\s/g,'').replace(/[^a-zA-Z0-9]/g, '')}`;

        console.log(`Upserting [${i + 1}/${rows.length}] ${transactionId}`);
        try {
            await prisma.bankTransaction.upsert({
                where: { id: transactionId },
                create: {
                    id: transactionId,
                    bankAccountId: 'acc-santander-5239',
                    date: dateObj,
                    description: description,
                    amount: dbAmount,
                    type: dbAmount < 0 ? 'DEBIT' : 'CREDIT',
                    status: TransactionStatus.PENDING,
                    origin: 'MANUAL_UPLOAD',
                    metadata: {
                        ingestedAt: new Date().toISOString(),
                        sourceFile: 'Ultimos movimientos_nac16_04_2026.xlsx',
                        manualIngestTask: true
                    }
                },
                update: {} 
            });
            inserted++;
            console.log(` > OK`);
        } catch (e: any) {
            console.error(` > Error:`, e.message);
        }
    }
    console.log(`Successfully ingested ${inserted} transactions into Santander TC (acc-santander-5239).`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
