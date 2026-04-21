import * as fs from 'fs';
import pdfParse from 'pdf-parse';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseDate(dateStr: string) {
    // format: DD/MM/YY
    const [d, m, y] = dateStr.split('/');
    const year = parseInt(y) + 2000;
    return new Date(year, parseInt(m) - 1, parseInt(d), 12, 0, 0); // 12 PM to avoid timezone glitches
}

async function main() {
    console.log('--- Extrayendo y Cargando TC Santander ---');
    const files = [
        'd:\\BRAVIUM-PRODUCCION\\scripts\\Estado Cuenta TC Santander Enero 2026.pdf',
        'd:\\BRAVIUM-PRODUCCION\\scripts\\Estado Cuenta TC Santander Febrero 2026.pdf'
    ];

    const organizationId = '715545b8-4522-4bb1-be81-3047546c0e8c'; // Fixed for DP Sistemas
    const tcAccountId = 'acc-santander-5239';

    // Regex: Start with Date, anything up to $, $, Amount (with dots and maybe minus), Description
    const rowRegex = /^(\d{2}\/\d{2}\/\d{2})([^\$]*)\$\s*([\-\d\.]+)(.*)/;
    
    let totalImported = 0;

    for (const file of files) {
        console.log(`\nProcesando: ${file.split('\\').pop()}`);
        const dataBuffer = fs.readFileSync(file);
        const data = await pdfParse(dataBuffer);
        
        const lines = data.text.split('\n').filter(l => l.trim().length > 0);
        const txsToCreate = [];

        for (const line of lines) {
            const match = line.trim().match(rowRegex);
            if (match) {
                const dateStr = match[1];
                const location = match[2].trim();
                let amountStr = match[3].replace(/\./g, '');
                const description = match[4].trim();

                const amount = parseInt(amountStr);

                // Ignore "MONTO CANCELADO" (payments to the card) since they are just transfers between CC and TC
                if (description.includes('MONTO CANCELADO')) continue;

                // For Credit Cards, purchases are debts (so they should be negative in our system to be DEBIT)
                // If it's a CREDIT (e.g., NOTA DE CREDITO), it's positive.
                // Wait, "NOTA DE CREDITO" says `-399.950` in the PDF. It means it reduces debt.
                // So positive amount in PDF = Debt (Purchase). Negative amount = Payment/Credit.
                // Since our system uses negatives for OUTFLOW (Purchases), we must flip the sign!
                const finalAmount = -amount;

                txsToCreate.push({
                    id: `tc-${dateStr.replace(/\//g,'')}-${Math.abs(amount)}-${Math.random().toString(36).substr(2, 5)}`,
                    bankAccountId: tcAccountId,
                    type: finalAmount < 0 ? 'DEBIT' : 'CREDIT',
                    amount: finalAmount,
                    date: parseDate(dateStr),
                    description: description,
                    status: 'PENDING',
                    metadata: { source: 'PDF_ESTADO_CUENTA', originalLocation: location }
                });
            }
        }

        console.log(`Encontradas ${txsToCreate.length} transacciones válidas. Guardando...`);
        
        for (const tx of txsToCreate) {
            // Upsert or avoid dupes
             const exists = await prisma.bankTransaction.findFirst({
                 where: {
                     amount: tx.amount,
                     description: tx.description,
                     date: {
                        gte: new Date(tx.date.getTime() - 86400000),
                        lte: new Date(tx.date.getTime() + 86400000)
                     }
                 }
             });
             
             if (!exists) {
                 await prisma.bankTransaction.create({ data: tx });
                 totalImported++;
             }
        }
    }

    console.log(`\n✅ Proceso completado. Se importaron ${totalImported} nuevas transacciones a la Tarjeta de Crédito.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
