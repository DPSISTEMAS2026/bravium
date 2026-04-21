import * as fs from 'fs';
import pdfParse from 'pdf-parse';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseDate(dateStr: string) {
    const [d, m, y] = dateStr.split('/');
    const year = parseInt(y) + 2000;
    return new Date(year, parseInt(m) - 1, parseInt(d), 12, 0, 0); 
}

async function main() {
    const files = [
        'd:\\BRAVIUM-PRODUCCION\\scripts\\Estado Cuenta TC Santander Enero 2026.pdf',
        'd:\\BRAVIUM-PRODUCCION\\scripts\\Estado Cuenta TC Santander Febrero 2026.pdf'
    ];

    const tcAccountId = 'acc-santander-5239';
    const rowRegex = /^(\d{2}\/\d{2}\/\d{2})([^\$]*)\$\s*([\-\d\.]+)(.*)/;
    
    let totalImported = 0;

    // Optional: Clear existing TC transactions before re-insertion to avoid dupes purely
    await prisma.bankTransaction.deleteMany({
        where: { bankAccountId: tcAccountId }
    });

    for (const file of files) {
        console.log(`\nProcesando: ${file.split('\\').pop()}`);
        const dataBuffer = fs.readFileSync(file);
        const data = await pdfParse(dataBuffer);
        const lines = data.text.split('\n').filter(l => l.trim().length > 0);
        
        const validTxs = [];

        for (const line of lines) {
            const match = line.trim().match(rowRegex);
            if (match) {
                const dateStr = match[1];
                const location = match[2].trim();
                let amountStr = match[3].replace(/\./g, '');
                const description = match[4].trim();
                const amount = parseInt(amountStr);

                if (description.includes('MONTO CANCELADO')) continue;
                const finalAmount = -amount;

                validTxs.push({
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
        
        if (validTxs.length > 0) {
            await prisma.bankTransaction.createMany({ data: validTxs });
            totalImported += validTxs.length;
            console.log(`[OK] Insertadas ${validTxs.length} transacciones.`);
        }
    }

    console.log(`\n✅ Proceso completado. Se importaron masivamente ${totalImported} nuevas transacciones a la Tarjeta de Crédito.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
