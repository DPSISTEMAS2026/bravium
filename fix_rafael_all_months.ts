import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function excelDateToJS(serial: number): Date {
    const utcDays = Math.floor(serial - 25569);
    return new Date(utcDays * 86400 * 1000);
}

async function main() {
    console.log('=== ASIGNAR BOLETAS DE RAFAEL (TODOS LOS MESES) ===\n');

    const RAFAEL_PROVIDER_ID = '66cc095c-7bb2-4ca0-87cf-4dfa2e09c8fa';
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');

    const rafaelEntries: { boleta: number; fechaPago: Date; amount: number; sheet: string }[] = [];

    for (const sheetName of workbook.SheetNames) {
        const sheetData = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: "" });

        for (const r of sheetData) {
            // Buscar en ambas columnas: "Item" (Enero) y "Empresa" (Feb-Abr)
            const nombre = String(r['Item'] || r['Empresa'] || '').toLowerCase();
            if (!nombre.includes('rafael')) continue;

            // Buscar la columna Boleta dinámicamente (puede tener trailing space, nbsp, etc)
            const keys = Object.keys(r);
            const boletaKey = keys.find(k => {
                const clean = k.toLowerCase().replace(/[\s\xa0]/g, '');
                return clean === 'boleta';
            });

            if (!boletaKey) continue;
            const boleta = Number(r[boletaKey]);
            if (isNaN(boleta) || boleta <= 0) continue;

            // Buscar valor dinámicamente también
            const valorKey = keys.find(k => k.toLowerCase().replace(/[\s\xa0]/g, '').includes('valor'));
            // En Marzo la columna valor son 18 espacios, buscar por contenido numérico
            let valor = 300000; // default para Rafael
            if (valorKey) {
                const v = Number(r[valorKey]);
                if (!isNaN(v) && v > 0) valor = v;
            }
            // También buscar en la columna de espacios (Marzo)
            if (valor === 300000) {
                for (const [k, v] of Object.entries(r)) {
                    if (k.trim() === '' && typeof v === 'number' && v > 0) {
                        valor = v;
                        break;
                    }
                }
            }

            const fechaRaw = r['Fecha de Pago'];
            const fecha = typeof fechaRaw === 'number' ? excelDateToJS(fechaRaw) : new Date();

            rafaelEntries.push({ boleta, fechaPago: fecha, amount: valor, sheet: sheetName });
        }
    }

    // Filtrar las que ya asignamos (305-310)
    const alreadyAssigned = new Set([305, 306, 307, 308, 309, 310]);
    const newEntries = rafaelEntries.filter(e => !alreadyAssigned.has(e.boleta));
    const oldEntries = rafaelEntries.filter(e => alreadyAssigned.has(e.boleta));

    console.log(`Total boletas Rafael en Excel: ${rafaelEntries.length}`);
    console.log(`  Ya asignadas anteriormente: ${oldEntries.length} (boletas ${[...alreadyAssigned].join(', ')})`);
    console.log(`  Nuevas por asignar: ${newEntries.length}\n`);

    for (const e of newEntries) {
        console.log(`  Boleta #${e.boleta} - $${e.amount} - ${e.fechaPago.toISOString().split('T')[0]} [${e.sheet}]`);
    }

    // Buscar transacciones UNMATCHED de Rafael ($-300.000)
    const rafaelTxs = await prisma.bankTransaction.findMany({
        where: {
            status: 'UNMATCHED',
            amount: -300000,
        },
        orderBy: { date: 'asc' }
    });

    // Excluir las que ya tienen boleta asignada
    const unassignedTxs = rafaelTxs.filter(tx => {
        const meta = (tx.metadata as any) || {};
        return !meta.boletaHonorarios;
    });

    console.log(`\nTransacciones UNMATCHED $-300.000 sin boleta: ${unassignedTxs.length}\n`);

    let assigned = 0;
    const usedTxIds = new Set<string>();

    for (const entry of newEntries) {
        const entryTime = entry.fechaPago.getTime();

        const candidates = unassignedTxs
            .filter(t => !usedTxIds.has(t.id))
            .sort((a, b) =>
                Math.abs(new Date(a.date).getTime() - entryTime) -
                Math.abs(new Date(b.date).getTime() - entryTime)
            );

        if (candidates.length === 0) {
            console.log(`  ⚠️ No hay tx disponible para Boleta #${entry.boleta}`);
            continue;
        }

        const bestTx = candidates[0];
        const daysDiff = Math.abs(new Date(bestTx.date).getTime() - entryTime) / (86400 * 1000);
        
        const meta = (bestTx.metadata as Record<string, any>) || {};
        meta.reviewNote = `RAFAEL FUENTES | Boleta #${entry.boleta}`;
        meta.boletaHonorarios = entry.boleta;
        meta.providerId = RAFAEL_PROVIDER_ID;
        meta.providerName = 'Rafael Fuentes';
        meta.reviewedAt = new Date().toISOString();

        await prisma.bankTransaction.update({
            where: { id: bestTx.id },
            data: { metadata: meta }
        });

        usedTxIds.add(bestTx.id);
        assigned++;
        console.log(`  ✅ Boleta #${entry.boleta} → $${bestTx.amount} del ${bestTx.date.toISOString().split('T')[0]} "${bestTx.description}" (diff: ${daysDiff.toFixed(0)}d)`);
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`  Boletas nuevas asignadas: ${assigned}`);
    
    // Mostrar cuántas de Rafael quedan sin boleta
    const remainingRafael = await prisma.bankTransaction.findMany({
        where: { status: 'UNMATCHED', amount: -300000 }
    });
    const withBoleta = remainingRafael.filter(t => (t.metadata as any)?.boletaHonorarios);
    const withoutBoleta = remainingRafael.filter(t => !(t.metadata as any)?.boletaHonorarios);
    console.log(`  Rafael con boleta: ${withBoleta.length}`);
    console.log(`  $-300.000 sin boleta: ${withoutBoleta.length}`);
    for (const t of withoutBoleta) {
        const meta = (t.metadata as any) || {};
        console.log(`    ${t.date.toISOString().split('T')[0]} "${t.description}" note: "${meta.reviewNote || '-'}"`);
    }

    const finalPending = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    const finalUnmatched = await prisma.bankTransaction.count({ where: { status: 'UNMATCHED' } });
    console.log(`\n  Estado: ${finalPending} PENDING, ${finalUnmatched} UNMATCHED`);

    await prisma.$disconnect();
}
main().catch(console.error);
