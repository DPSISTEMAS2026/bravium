import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';

const prisma = new PrismaClient();

function excelDateToJS(serial: number): Date {
    const utcDays = Math.floor(serial - 25569);
    return new Date(utcDays * 86400 * 1000);
}

// Categorías por patrón de descripción
const PATTERNS: { pattern: RegExp; category: string }[] = [
    { pattern: /REMUNERACION/i, category: 'Sueldos / Remuneraciones' },
    { pattern: /PREVIRED/i, category: 'Cotizaciones Previsionales (Previred)' },
    { pattern: /COM\.?\s*MANTENCION/i, category: 'Comisión Mantención Bancaria' },
    { pattern: /COMISION DE MANTENCION/i, category: 'Comisión Mantención Bancaria' },
    { pattern: /IVA COM\./i, category: 'IVA Comisiones Bancarias' },
    { pattern: /Transf.*rafael fuentes/i, category: 'Honorarios Rafael Fuentes' },
    { pattern: /Transf.*AVILA RAMIREZ/i, category: 'Honorarios / Pagos Ávila Ramírez' },
    { pattern: /Transf.*ISIDORA HENRIQ/i, category: 'Honorarios / Pagos Isidora Henríquez' },
    { pattern: /Transf.*Cristian soto/i, category: 'Honorarios / Pagos Cristián Soto' },
    { pattern: /Transf.*Amanda Diaz/i, category: 'Pagos Amanda Díaz' },
    { pattern: /Transf.*Comunidad edif/i, category: 'Gastos Comunes Edificio' },
    { pattern: /Transf.*VIAJES TREBOL/i, category: 'Viajes Trébol' },
    { pattern: /Traspaso.*T\. Cr[eé]dito/i, category: 'Traspaso a Tarjeta de Crédito' },
    { pattern: /PAGO EN LINEA S\.I\.I\./i, category: 'Pago SII (Impuestos)' },
    { pattern: /PREPAGO EN CUOTAS/i, category: 'Prepago Cuotas TC' },
    { pattern: /Egreso por Compra de Divisas/i, category: 'Compra de Divisas (Internacional)' },
    { pattern: /Envio Transferencia Internacional/i, category: 'Transferencia Internacional' },
    { pattern: /Cargo Mercado Capitales/i, category: 'Mercado Capitales' },
    { pattern: /MONTO CANCELADO/i, category: 'Pago TC (Monto Cancelado)' },
    { pattern: /Transf.*LOGINSA BIOMED/i, category: 'Pago Loginsa Biomédica' },
    { pattern: /MP \*TICKETPLUS/i, category: 'Tickets/Eventos (TicketPlus)' },
    { pattern: /LE BISTROT/i, category: 'Gastos Alimentación/Restaurant' },
];

async function main() {
    console.log('=== ETIQUETAR Y MARCAR REVISADOS ===\n');

    // 1. Cargar Excel para cruzar por monto+fecha
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');
    const monthlySheets = ['ENERO 2026', 'FEBRERO 2026', 'MARZO 2026', 'ABRIL 2026'];

    interface ExcelRow { sheet: string; empresa: string; detalle: string; valor: number; fecha: Date; }
    const excelRows: ExcelRow[] = [];

    for (const sheetName of monthlySheets) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const data = xlsx.utils.sheet_to_json<any>(sheet, { defval: '' });
        for (const row of data) {
            const keys = Object.keys(row);
            const valorKey = keys.find(k => k.toLowerCase().replace(/[\s\xa0]/g, '').includes('valor'));
            const valor = valorKey ? Math.abs(Number(row[valorKey]) || 0) : 0;
            if (valor <= 0) continue;

            const fechaRaw = row['Fecha de Pago'];
            if (typeof fechaRaw !== 'number') continue;
            const fecha = excelDateToJS(fechaRaw);
            const empresa = String(row['Empresa'] || row['Item'] || '');
            const detalle = String(row['Detalle'] || '');

            excelRows.push({ sheet: sheetName, empresa, detalle, valor, fecha });
        }
    }

    // 2. Obtener transacciones sin DTE (PENDING/UNMATCHED sin match confirmado)
    const sinDte = await prisma.bankTransaction.findMany({
        where: {
            date: { gte: new Date('2026-01-01') },
            type: 'DEBIT',
            status: { in: ['PENDING', 'UNMATCHED'] },
            matches: { none: { status: 'CONFIRMED' } }
        },
        orderBy: { date: 'asc' }
    });

    console.log(`Transacciones sin DTE a procesar: ${sinDte.length}\n`);

    let etiquetados = 0;
    let excelMatch = 0;
    let patternMatch = 0;
    let sinCategoria = 0;

    for (const tx of sinDte) {
        const amount = Math.abs(tx.amount);
        const txDate = tx.date;
        let category = '';
        let source = '';

        // Intentar match por Excel (monto ±50, fecha ±5 días)
        const excelHit = excelRows.find(e => {
            const amtDiff = Math.abs(e.valor - amount);
            const dayDiff = Math.abs(e.fecha.getTime() - txDate.getTime()) / 86400000;
            return amtDiff < 50 && dayDiff <= 5;
        });

        if (excelHit) {
            category = excelHit.detalle || excelHit.empresa;
            source = `Excel [${excelHit.sheet}]: ${excelHit.empresa}`;
            excelMatch++;
        } else {
            // Intentar match por patrón
            for (const p of PATTERNS) {
                if (p.pattern.test(tx.description)) {
                    category = p.category;
                    source = 'Patrón automático';
                    patternMatch++;
                    break;
                }
            }
        }

        if (!category) {
            sinCategoria++;
            continue;
        }

        // Actualizar la transacción: metadata con la categoría y marcar UNMATCHED (revisado sin DTE)
        const existingMeta = (tx.metadata as any) || {};
        await prisma.bankTransaction.update({
            where: { id: tx.id },
            data: {
                status: 'UNMATCHED',
                metadata: {
                    ...existingMeta,
                    reviewedAt: new Date().toISOString(),
                    reviewedBy: 'EXCEL_PATTERN_MATCH',
                    category,
                    source,
                    noInvoiceExpected: true
                }
            }
        });

        etiquetados++;
        console.log(`  ✅ ${txDate.toISOString().split('T')[0]} $${amount.toLocaleString('es-CL').padStart(12)} | "${tx.description}"`);
        console.log(`     → ${category} (${source})`);
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`  Etiquetados: ${etiquetados}`);
    console.log(`    - Desde Excel: ${excelMatch}`);
    console.log(`    - Por patrón: ${patternMatch}`);
    console.log(`  Sin categoría (pendientes): ${sinCategoria}`);

    // Resumen final
    const fp = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    const fu = await prisma.bankTransaction.count({ where: { status: 'UNMATCHED' } });
    const fm = await prisma.bankTransaction.count({ where: { status: 'MATCHED' } });
    console.log(`\n  Estado: ${fp} PENDING, ${fu} UNMATCHED, ${fm} MATCHED`);

    await prisma.$disconnect();
}
main().catch(console.error);
