import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 1. Revisar estructura Excel para Rafael
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');
    let allRows: any[] = [];
    for (const sheetName of workbook.SheetNames) {
        const sheetData = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: "" });
        for (const row of sheetData) allRows.push({ ...row, _sheet: sheetName });
    }

    // Mostrar filas de Rafael
    const rafaelRows = allRows.filter(r => 
        String(r['Item'] || '').toUpperCase().includes('RAFAEL') ||
        String(r['Detalle'] || '').toUpperCase().includes('RAFAEL')
    );

    console.log(`=== FILAS DE RAFAEL EN EXCEL (${rafaelRows.length}) ===\n`);
    for (const r of rafaelRows.slice(0, 10)) {
        console.log(JSON.stringify({
            Item: r['Item'],
            Detalle: r['Detalle'],
            Factura: r['Factura'],
            'Boleta ': r['Boleta '],
            Valor: r[' Valor '],
            FechaPago: r['Fecha de Pago'],
            Cuenta: r['Transferencia Banco / Tarjeta'],
            _sheet: r._sheet
        }));
    }

    // 2. Buscar proveedor Rafael en el sistema
    console.log('\n=== PROVEEDOR RAFAEL EN DB ===');
    const rafael = await prisma.provider.findMany({
        where: { name: { contains: 'Rafael', mode: 'insensitive' } }
    });
    for (const r of rafael) {
        console.log(`  ID: ${r.id} | Nombre: ${r.name} | RUT: ${r.rut}`);
    }

    // 3. Ver cuántos UNMATCHED tienen "Factura electrÃ³nica" (encoding roto)
    const unmatched = await prisma.bankTransaction.findMany({ where: { status: 'UNMATCHED' } });
    let corruptFactura = 0;
    for (const tx of unmatched) {
        const meta = (tx.metadata as any) || {};
        const note = String(meta.reviewNote || '');
        if (note.includes('electrÃ') || note.includes('Factura electr')) {
            // Check if it ONLY has "factura electronica" without a useful provider name
            const noteClean = note.replace(/Factura electr[^\s]*/gi, '').replace(/\|/g, '').trim();
            if (noteClean.length < 3) {
                corruptFactura++;
            }
        }
    }
    console.log(`\n=== UNMATCHED con solo "Factura electrÃ³nica" (sin proveedor): ${corruptFactura} ===`);

    await prisma.$disconnect();
}
main().catch(console.error);
