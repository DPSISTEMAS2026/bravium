import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function excelDateToJS(serial: number): Date {
    const utcDays = Math.floor(serial - 25569);
    return new Date(utcDays * 86400 * 1000);
}

async function main() {
    console.log('==========================================================');
    console.log('  ANOTAR PENDIENTES DESDE EXCEL + DETECTAR GASTOS FIJOS');
    console.log('==========================================================\n');

    // Leer Excel
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');
    const allExcelRows: any[] = [];
    for (const sheetName of workbook.SheetNames) {
        const sheetData = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: "" });
        for (const row of sheetData) {
            allExcelRows.push({ ...row, _sheet: sheetName });
        }
    }

    // Obtener transacciones pendientes
    const pendingTxs = await prisma.bankTransaction.findMany({
        where: { status: 'PENDING' },
        orderBy: { date: 'asc' }
    });

    console.log(`Pendientes: ${pendingTxs.length} | Filas Excel: ${allExcelRows.length}\n`);

    // =====================================================
    // PASO 1: Anotar cada pending con el comentario del Excel
    // =====================================================
    let annotated = 0;
    const amountGroups = new Map<number, { tx: any; excelNote: string; excelSheet: string; excelDate: string }[]>();

    for (const tx of pendingTxs) {
        const absAmount = Math.abs(tx.amount);

        // Buscar en Excel por monto exacto
        const excelHits = allExcelRows.filter(r => {
            const val = Number(r[' Valor ']);
            return !isNaN(val) && val === absAmount;
        });

        if (excelHits.length === 0) continue;

        // Buscar el hit con la fecha más cercana al movimiento (priorizamos el que realmente corresponde)
        const txTime = new Date(tx.date).getTime();
        excelHits.sort((a, b) => {
            const dateA = typeof a['Fecha de Pago'] === 'number' ? excelDateToJS(a['Fecha de Pago']).getTime() : 0;
            const dateB = typeof b['Fecha de Pago'] === 'number' ? excelDateToJS(b['Fecha de Pago']).getTime() : 0;
            return Math.abs(dateA - txTime) - Math.abs(dateB - txTime);
        });

        const bestHit = excelHits[0];
        const item = String(bestHit['Item'] || '').trim();
        const detalle = String(bestHit['Detalle'] || '').trim();
        const comentario = String(bestHit['Comentario'] || '').trim();
        const sheet = bestHit._sheet;
        const fechaPago = bestHit['Fecha de Pago'];
        const fechaStr = typeof fechaPago === 'number' && fechaPago > 40000
            ? excelDateToJS(fechaPago).toISOString().split('T')[0]
            : String(fechaPago);

        // Construir nota combinada
        const parts = [item, detalle, comentario].filter(p => p && p.length > 0);
        const excelNote = parts.join(' | ') || '(sin detalle en Excel)';

        // Escribir en metadata de la transacción
        const meta = (tx.metadata as Record<string, any>) || {};
        meta.reviewNote = `[Excel ${sheet}] ${excelNote}`;
        meta.excelItem = item;
        meta.excelDetalle = detalle;
        meta.excelComentario = comentario;
        meta.excelFechaPago = fechaStr;
        meta.reviewedAt = new Date().toISOString();

        await prisma.bankTransaction.update({
            where: { id: tx.id },
            data: {
                status: 'UNMATCHED',
                metadata: meta
            }
        });

        annotated++;
        console.log(`  📝 $${tx.amount} (${tx.date.toISOString().split('T')[0]}) → "${excelNote}" [${sheet}]`);

        // Agregar al mapa de agrupación por monto para detectar recurrencia
        if (!amountGroups.has(absAmount)) amountGroups.set(absAmount, []);
        amountGroups.get(absAmount)!.push({ tx, excelNote, excelSheet: sheet, excelDate: fechaStr });
    }

    console.log(`\n✅ Anotados: ${annotated} movimientos con comentario del Excel.\n`);

    // =====================================================
    // PASO 2: Detectar gastos fijos (mismo monto en 2+ meses)
    // =====================================================
    console.log('==========================================================');
    console.log('  GASTOS FIJOS DETECTADOS (mismo monto en 2+ meses)');
    console.log('==========================================================\n');

    const fixedExpenses: { amount: number; description: string; months: string[]; count: number }[] = [];

    for (const [amount, entries] of amountGroups) {
        if (entries.length < 2) continue;

        // Extraer meses únicos
        const months = new Set<string>();
        for (const e of entries) {
            const txDate = new Date(e.tx.date);
            months.add(`${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`);
        }

        if (months.size >= 2) {
            const desc = entries[0].excelNote;
            const monthList = Array.from(months).sort();
            fixedExpenses.push({ amount, description: desc, months: monthList, count: entries.length });
        }
    }

    // También buscar recurrencia en TODAS las transacciones (no solo pendientes) para los montos de los pendientes
    console.log('  Buscando recurrencia completa en historial bancario...\n');

    const allTxs = await prisma.bankTransaction.findMany({
        where: { date: { gte: new Date('2026-01-01') } },
        orderBy: { date: 'asc' }
    });

    // Para cada monto de las transacciones que anotamos, buscar cuántas veces aparece en el año
    const checkedAmounts = new Set<number>();
    const recurringReport: { amount: number; note: string; occurrences: { date: string; desc: string; status: string }[] }[] = [];

    for (const [amount, entries] of amountGroups) {
        if (checkedAmounts.has(amount)) continue;
        checkedAmounts.add(amount);

        const allWithThisAmount = allTxs.filter(t => Math.abs(t.amount) === amount);
        const uniqueMonths = new Set(allWithThisAmount.map(t => {
            const d = new Date(t.date);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }));

        if (uniqueMonths.size >= 2) {
            recurringReport.push({
                amount,
                note: entries[0].excelNote,
                occurrences: allWithThisAmount.map(t => ({
                    date: t.date.toISOString().split('T')[0],
                    desc: t.description,
                    status: t.status
                }))
            });
        }
    }

    // Ordenar por cantidad de ocurrencias
    recurringReport.sort((a, b) => b.occurrences.length - a.occurrences.length);

    for (const r of recurringReport) {
        const monthSet = new Set(r.occurrences.map(o => o.date.substring(0, 7)));
        console.log(`  💰 $${r.amount.toLocaleString('es-CL')} → "${r.note}"`);
        console.log(`     Aparece en ${monthSet.size} meses: ${Array.from(monthSet).sort().join(', ')}`);
        for (const o of r.occurrences) {
            const icon = o.status === 'MATCHED' ? '✅' : o.status === 'REVIEWED' ? '📝' : '⏳';
            console.log(`       ${icon} ${o.date} - ${o.desc} (${o.status})`);
        }
        console.log('');
    }

    console.log('==========================================================');
    console.log(`  RESUMEN`);
    console.log('==========================================================');
    console.log(`  Transacciones anotadas con Excel:  ${annotated}`);
    console.log(`  Gastos recurrentes detectados:     ${recurringReport.length}`);
    console.log('==========================================================');

    const finalPending = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    const finalReviewed = await prisma.bankTransaction.count({ where: { status: 'UNMATCHED' } });
    console.log(`\n  Estado final: ${finalPending} PENDING, ${finalReviewed} UNMATCHED (anotados)`);

    await prisma.$disconnect();
}
main().catch(console.error);
