import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface ExcelEntry {
    folio: string;
    folioNumbers: number[];
    amount: number;
    date: string;
    empresa: string;
    sheet: string;
}

function parseAmount(val: string): number {
    if (!val) return 0;
    // Remove $, spaces, dots (thousands), and parse
    const cleaned = val.replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '').trim();
    return parseInt(cleaned, 10) || 0;
}

function extractFolios(val: string): number[] {
    if (!val) return [];
    // Handle multiple folios separated by " - ", ",", " / " etc
    const parts = String(val).split(/[\s]*[-,/][\s]*/);
    const folios: number[] = [];
    for (const p of parts) {
        const num = parseInt(p.trim(), 10);
        if (!isNaN(num) && num > 0) folios.push(num);
    }
    return folios;
}

async function main() {
    const filePath = 'd:\\BRAVIUM-PRODUCCION\\Pagos 2026 (1).xlsx';
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    const sheetsToProcess = ['ENERO 2026', 'FEBRERO 2026', 'MARZO 2026', 'ABRIL 2026'];

    const allEntries: ExcelEntry[] = [];

    for (const sheetName of sheetsToProcess) {
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { raw: false });

        for (const row of rows) {
            // Column for folio: "Factura" in most sheets, or check "Tipo Boleta/Factura" 
            const folioRaw = row['Factura'] || '';
            const folioNumbers = extractFolios(folioRaw);
            if (folioNumbers.length === 0) continue; // No folio = skip (boletas, contratos, etc)

            const amount = parseAmount(row[' Valor '] || row['Valor'] || '');
            const date = row['Fecha de Pago'] || '';
            const empresa = row['Empresa'] || row['Item'] || row['Detalle'] || '';

            allEntries.push({
                folio: folioRaw,
                folioNumbers,
                amount,
                date,
                empresa,
                sheet: sheetName
            });
        }
    }

    console.log(`\nTotal Excel entries with folio: ${allEntries.length}`);

    // Get ALL unique folios from the Excel
    const allFolios = new Set<number>();
    for (const entry of allEntries) {
        for (const f of entry.folioNumbers) allFolios.add(f);
    }
    // Filter out invalid folios (bigger than INT4 max)
    const MAX_INT4 = 2147483647;
    const validFolios = [...allFolios].filter(f => f > 0 && f <= MAX_INT4);
    console.log(`Valid folios (within INT4 range): ${validFolios.length}\n`);

    // Query DB for all these folios at once
    const dbDtes = await prisma.dTE.findMany({
        where: { folio: { in: validFolios } },
        include: {
            matches: { 
                where: { status: 'CONFIRMED' },
                select: { id: true, transactionId: true, status: true }
            },
            provider: { select: { name: true } }
        }
    });

    // Build a map: folio -> DTE
    const folioMap = new Map<number, typeof dbDtes[0]>();
    for (const dte of dbDtes) {
        folioMap.set(dte.folio, dte);
    }

    // Cross-reference
    const notInSystem: ExcelEntry[] = [];
    const inSystemNotReconciled: { entry: ExcelEntry; dte: typeof dbDtes[0] }[] = [];
    const fullyReconciled: { entry: ExcelEntry; dte: typeof dbDtes[0] }[] = [];

    for (const entry of allEntries) {
        for (const folio of entry.folioNumbers) {
            const dte = folioMap.get(folio);

            if (!dte) {
                notInSystem.push(entry);
            } else if (dte.matches.length === 0) {
                inSystemNotReconciled.push({ entry, dte });
            } else {
                fullyReconciled.push({ entry, dte });
            }
        }
    }

    // REPORT
    console.log('='.repeat(80));
    console.log('DTEs EN EXCEL PERO NO CONCILIADOS EN EL SISTEMA');
    console.log('(Existen en la BD pero sin match CONFIRMED)');
    console.log('='.repeat(80));
    console.log(`Total: ${inSystemNotReconciled.length}\n`);

    // Group by sheet
    const bySheet = new Map<string, typeof inSystemNotReconciled>();
    for (const item of inSystemNotReconciled) {
        const sheet = item.entry.sheet;
        if (!bySheet.has(sheet)) bySheet.set(sheet, []);
        bySheet.get(sheet)!.push(item);
    }

    for (const [sheet, items] of bySheet) {
        console.log(`\n--- ${sheet} (${items.length} sin conciliar) ---`);
        for (const { entry, dte } of items) {
            console.log(`  Folio ${dte.folio} (T${dte.type}) | ${dte.provider?.name || 'N/A'} | DTE $${dte.totalAmount} | Excel $${entry.amount} | Fecha: ${entry.date} | PayStatus: ${dte.paymentStatus}`);
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('FOLIOS EN EXCEL PERO NO EXISTEN EN LA BD');
    console.log('(El DTE no fue ingresado por LibreDTE)');
    console.log('='.repeat(80));
    console.log(`Total: ${notInSystem.length}\n`);

    for (const entry of notInSystem.slice(0, 30)) {
        console.log(`  Folio ${entry.folio} | ${entry.empresa} | $${entry.amount} | ${entry.date} | Sheet: ${entry.sheet}`);
    }
    if (notInSystem.length > 30) {
        console.log(`  ... y ${notInSystem.length - 30} más`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('RESUMEN');
    console.log('='.repeat(80));
    console.log(`Folios en Excel: ${allFolios.size}`);
    console.log(`✅ Conciliados (Excel + Sistema OK): ${fullyReconciled.length}`);
    console.log(`⚠️  En sistema pero SIN conciliar: ${inSystemNotReconciled.length}`);
    console.log(`❌ No existen en el sistema: ${notInSystem.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
