import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const prisma = new PrismaClient();

function parseAmount(val: string): number {
    if (!val) return 0;
    const cleaned = val.replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '').trim();
    return parseInt(cleaned, 10) || 0;
}

function extractFolios(val: string): number[] {
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
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetsToProcess = ['ENERO 2026', 'FEBRERO 2026', 'MARZO 2026', 'ABRIL 2026'];

    // Extract folios from Excel
    const excelEntries: { folio: number; amount: number; date: string; empresa: string; sheet: string }[] = [];
    for (const sheetName of sheetsToProcess) {
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { raw: false });
        for (const row of rows) {
            const folioRaw = row['Factura'] || '';
            const folioNumbers = extractFolios(folioRaw);
            if (folioNumbers.length === 0) continue;
            const amount = parseAmount(row[' Valor '] || '');
            const date = row['Fecha de Pago'] || '';
            const empresa = row['Empresa'] || row['Item'] || '';
            for (const folio of folioNumbers) {
                excelEntries.push({ folio, amount, date, empresa, sheet: sheetName });
            }
        }
    }

    // Find unreconciled DTEs
    const allFolios = [...new Set(excelEntries.map(e => e.folio))];
    const dbDtes = await prisma.dTE.findMany({
        where: { folio: { in: allFolios } },
        include: {
            matches: { where: { status: 'CONFIRMED' }, select: { id: true } },
            provider: { select: { name: true } }
        }
    });

    const folioToDte = new Map<number, typeof dbDtes[0]>();
    for (const d of dbDtes) folioToDte.set(d.folio, d);

    const unreconciled = excelEntries.filter(e => {
        const dte = folioToDte.get(e.folio);
        return dte && dte.matches.length === 0;
    });

    // Deduplicate by folio
    const seen = new Set<number>();
    const uniqueUnreconciled = unreconciled.filter(e => {
        if (seen.has(e.folio)) return false;
        seen.add(e.folio);
        return true;
    });

    console.log(`\nAnalizando ${uniqueUnreconciled.length} DTEs sin conciliar...\n`);

    let withTx = 0;
    let withoutTx = 0;
    let partialTx = 0;

    const results: { status: string; folio: number; provider: string; dteAmount: number; excelDate: string; txMatch: string; sheet: string }[] = [];

    for (const entry of uniqueUnreconciled) {
        const dte = folioToDte.get(entry.folio)!;
        const dteAmount = dte.totalAmount;
        const dteDate = dte.issuedDate;

        // Search window: Excel payment date ± 5 days
        let searchDate: Date;
        const parts = entry.date.match(/(\d+)\/(\d+)\/(\d+)/);
        if (parts) {
            const [, m, d, y] = parts;
            const year = parseInt(y) < 100 ? 2000 + parseInt(y) : parseInt(y);
            searchDate = new Date(year, parseInt(m) - 1, parseInt(d));
        } else {
            searchDate = new Date(dteDate);
        }

        const fromDate = new Date(searchDate);
        fromDate.setDate(fromDate.getDate() - 5);
        const toDate = new Date(searchDate);
        toDate.setDate(toDate.getDate() + 5);

        // Look for exact amount match
        const exactTx = await prisma.bankTransaction.findFirst({
            where: {
                amount: -dteAmount, // Payments are negative (DEBIT)
                date: { gte: fromDate, lte: toDate },
                status: { in: ['PENDING', 'UNMATCHED'] }
            },
            select: { id: true, description: true, date: true, amount: true, status: true }
        });

        // Also check with positive amount (some entries might store absolute)
        const exactTxPos = !exactTx ? await prisma.bankTransaction.findFirst({
            where: {
                amount: dteAmount,
                date: { gte: fromDate, lte: toDate },
                status: { in: ['PENDING', 'UNMATCHED'] }
            },
            select: { id: true, description: true, date: true, amount: true, status: true }
        }) : null;

        const foundTx = exactTx || exactTxPos;

        // Also check if ANY tx with that amount exists (even matched)
        const anyTx = !foundTx ? await prisma.bankTransaction.findFirst({
            where: {
                OR: [
                    { amount: -dteAmount },
                    { amount: dteAmount }
                ],
                date: { gte: fromDate, lte: toDate },
            },
            select: { id: true, description: true, date: true, amount: true, status: true }
        }) : null;

        let status: string;
        let txInfo: string;

        if (foundTx) {
            withTx++;
            status = '✅ TX DISPONIBLE';
            txInfo = `"${foundTx.description}" | ${foundTx.date.toISOString().split('T')[0]} | $${foundTx.amount} | ${foundTx.status}`;
        } else if (anyTx) {
            partialTx++;
            status = '🟡 TX EXISTE (YA MATCHED)';
            txInfo = `"${anyTx.description}" | ${anyTx.date.toISOString().split('T')[0]} | $${anyTx.amount} | ${anyTx.status}`;
        } else {
            withoutTx++;
            status = '❌ SIN TX';
            txInfo = `No hay movimiento bancario de $${dteAmount} cerca de ${entry.date}`;
        }

        results.push({
            status,
            folio: entry.folio,
            provider: dte.provider?.name || 'N/A',
            dteAmount,
            excelDate: entry.date,
            txMatch: txInfo,
            sheet: entry.sheet
        });
    }

    // Print sorted by status
    console.log('='.repeat(100));
    console.log('✅ DTEs CON MOVIMIENTO BANCARIO DISPONIBLE (se pueden conciliar automáticamente)');
    console.log('='.repeat(100));
    const available = results.filter(r => r.status.includes('DISPONIBLE'));
    console.log(`Total: ${available.length}\n`);
    for (const r of available) {
        console.log(`  F${r.folio} | ${r.provider} | DTE $${r.dteAmount} | Pago: ${r.excelDate} | TX: ${r.txMatch}`);
    }

    console.log('\n' + '='.repeat(100));
    console.log('🟡 DTEs CON TX PERO YA ESTÁ MATCHED A OTRO DTE');
    console.log('='.repeat(100));
    const alreadyMatched = results.filter(r => r.status.includes('YA MATCHED'));
    console.log(`Total: ${alreadyMatched.length}\n`);
    for (const r of alreadyMatched) {
        console.log(`  F${r.folio} | ${r.provider} | DTE $${r.dteAmount} | Pago: ${r.excelDate} | TX: ${r.txMatch}`);
    }

    console.log('\n' + '='.repeat(100));
    console.log('❌ DTEs SIN MOVIMIENTO BANCARIO (no se puede conciliar — falta la cartola)');
    console.log('='.repeat(100));
    const noTx = results.filter(r => r.status.includes('SIN TX'));
    console.log(`Total: ${noTx.length}\n`);
    for (const r of noTx) {
        console.log(`  F${r.folio} | ${r.provider} | DTE $${r.dteAmount} | Pago: ${r.excelDate} | ${r.sheet}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('RESUMEN');
    console.log('='.repeat(50));
    console.log(`✅ Con TX disponible (conciliable): ${withTx}`);
    console.log(`🟡 TX existe pero ya matched: ${partialTx}`);
    console.log(`❌ Sin TX en el sistema: ${withoutTx}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
