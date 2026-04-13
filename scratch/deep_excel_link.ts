import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const prisma = new PrismaClient();

function parseAmount(val: any): number {
    if (!val) return 0;
    const cleaned = String(val).replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '').trim();
    return parseInt(cleaned, 10) || 0;
}

function extractFolios(val: any): number[] {
    if (!val) return [];
    const parts = String(val).split(/[\s]*[-,/][\s]*/);
    const folios: number[] = [];
    for (const p of parts) {
        const num = parseInt(p.trim(), 10);
        if (!isNaN(num) && num > 0 && num <= 2147483647) folios.push(num);
    }
    return folios;
}

async function main() {
    const filePath = 'd:\\BRAVIUM-PRODUCCION\\Pagos 2026 (1).xlsx';
    const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: true });
    const sheets = ['ENERO 2026', 'FEBRERO 2026', 'MARZO 2026', 'ABRIL 2026'];

    // 1. Collect all Excel entries
    const excelEntries: any[] = [];
    for (const sheetName of sheets) {
        const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });
        for (const row of rows) {
            const folioRaw = row['Factura'];
            const folioNumbers = extractFolios(folioRaw);
            if (folioNumbers.length === 0) continue;
            
            const amount = parseAmount(row[' Valor '] || row['Valor'] || '');
            const date = row['Fecha de Pago'] || '';
            const detail = row['Transferencia Banco / Tarjeta'] || '';
            const empresa = row['Empresa'] || row['Item'] || '';
            
            excelEntries.push({ folioRaw, folioNumbers, amount, date, detail, empresa, sheet: sheetName });
        }
    }

    // 2. Identify DTEs already in the system but NOT reconciled
    const allExcelFolios = [...new Set(excelEntries.flatMap(e => e.folioNumbers))];
    const dtes = await prisma.dTE.findMany({
        where: { folio: { in: allExcelFolios }, matches: { none: { status: 'CONFIRMED' } } },
        include: { provider: true }
    });
    const dteMap = new Map<number, typeof dtes[0]>();
    for (const d of dtes) dteMap.set(d.folio, d);

    // 3. Search for available matches
    console.log('--- FINDING SAFE RECONCILIATION OPPORTUNITIES ---\n');

    // Case A: Sum of folios in Excel matches one TX
    const excelByPaymentKey = new Map<string, any[]>();
    for (const e of excelEntries) {
        if (e.detail.length > 5) {
            const key = `${e.date}|${e.detail}`;
            if (!excelByPaymentKey.has(key)) excelByPaymentKey.set(key, []);
            excelByPaymentKey.get(key)!.push(e);
        }
    }

    for (const [key, items] of excelByPaymentKey) {
        const total = items.reduce((sum, i) => sum + i.amount, 0);
        // Find TX with this total sum
        const tx = await prisma.bankTransaction.findFirst({
            where: { amount: -total, status: { in: ['PENDING', 'UNMATCHED', 'PARTIALLY_MATCHED'] } }
        });

        if (tx) {
            const foliosFound = items.filter(i => i.folioNumbers.every((f: number) => dteMap.has(f)));
            if (foliosFound.length === items.length) {
                console.log(`[Group Match] Sum $${total} on ${key}`);
                console.log(`  Bank TX: "${tx.description}" | ${tx.date.toISOString().split('T')[0]}`);
                items.forEach(i => console.log(`  - F${i.folioRaw} | $${i.amount} | ${i.empresa}`));
                console.log('');
            }
        }
    }

    // Case B: Simple 1-to-1 Match that was missed
    for (const e of excelEntries) {
        if (e.folioNumbers.length === 1) {
            const f = e.folioNumbers[0];
            const dte = dteMap.get(f);
            if (dte) {
                const tx = await prisma.bankTransaction.findFirst({
                    where: { amount: -dte.totalAmount, status: { in: ['PENDING', 'UNMATCHED'] } }
                });
                if (tx) {
                    // Check if they are somewhat close in date (within 15 days)
                    const diffDays = Math.abs(tx.date.getTime() - dte.issuedDate.getTime()) / (1000 * 60 * 60 * 24);
                    if (diffDays <= 20) {
                        console.log(`[1-to-1 Match] Folio ${f} ($${dte.totalAmount})`);
                        console.log(`  Bank TX: "${tx.description}" | ${tx.date.toISOString().split('T')[0]} (Status: ${tx.status})`);
                        console.log('');
                    }
                }
            }
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
