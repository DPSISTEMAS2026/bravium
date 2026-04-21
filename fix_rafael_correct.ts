import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function excelDateToJS(serial: number): Date {
    const utcDays = Math.floor(serial - 25569);
    return new Date(utcDays * 86400 * 1000);
}

async function main() {
    console.log('=== REASIGNAR BOLETAS RAFAEL (CORREGIDO) ===\n');

    const RAFAEL_PROVIDER_ID = '66cc095c-7bb2-4ca0-87cf-4dfa2e09c8fa';
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');

    // 1. Recopilar TODAS las boletas de Rafael del Excel
    const rafaelEntries: { boleta: number; fechaPago: Date; amount: number; sheet: string }[] = [];
    for (const sheetName of workbook.SheetNames) {
        const sheetData = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: "" });
        for (const r of sheetData) {
            const nombre = String(r['Item'] || r['Empresa'] || '').toLowerCase();
            if (!nombre.includes('rafael')) continue;

            const keys = Object.keys(r);
            const boletaKey = keys.find(k => k.toLowerCase().replace(/[\s\xa0]/g, '') === 'boleta');
            if (!boletaKey) continue;
            const boleta = Number(r[boletaKey]);
            if (isNaN(boleta) || boleta <= 0) continue;

            const fechaRaw = r['Fecha de Pago'];
            const fecha = typeof fechaRaw === 'number' ? excelDateToJS(fechaRaw) : new Date();
            rafaelEntries.push({ boleta, fechaPago: fecha, amount: 300000, sheet: sheetName });
        }
    }

    console.log(`Total boletas Rafael en Excel: ${rafaelEntries.length}`);
    rafaelEntries.sort((a, b) => a.fechaPago.getTime() - b.fechaPago.getTime());
    for (const e of rafaelEntries) {
        console.log(`  #${e.boleta} - ${e.fechaPago.toISOString().split('T')[0]} [${e.sheet}]`);
    }

    // 2. Limpiar TODAS las asignaciones previas de boleta Rafael
    console.log('\n--- Limpiando asignaciones previas ---');
    const allWithBoleta = await prisma.bankTransaction.findMany({
        where: { amount: -300000 }
    });
    
    let cleaned = 0;
    for (const tx of allWithBoleta) {
        const meta = (tx.metadata as Record<string, any>) || {};
        if (meta.boletaHonorarios) {
            delete meta.boletaHonorarios;
            // Limpiar la nota si solo era de Rafael
            if (String(meta.reviewNote || '').includes('RAFAEL FUENTES | Boleta #')) {
                delete meta.reviewNote;
            }
            delete meta.providerId;
            delete meta.providerName;
            delete meta.reviewedAt;
            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: { metadata: meta }
            });
            cleaned++;
        }
    }
    console.log(`  Limpiadas ${cleaned} asignaciones previas\n`);

    // 3. Buscar TODAS las transacciones de Rafael (MATCHED + UNMATCHED + PENDING)
    // Rafael usa RUT 16.751.160-0
    const allRafaelTxs = await prisma.bankTransaction.findMany({
        where: {
            amount: -300000,
            OR: [
                { description: { contains: '16.751.160-0' } },
                { description: { contains: '16751160' } },
                { description: { contains: '0167511600' } },
                { description: { contains: 'rafael fuentes', mode: 'insensitive' } },
            ]
        },
        orderBy: { date: 'asc' }
    });

    console.log(`Transacciones bancarias de Rafael ($-300.000): ${allRafaelTxs.length}`);
    for (const tx of allRafaelTxs) {
        console.log(`  ${tx.date.toISOString().split('T')[0]} [${tx.status}] "${tx.description}"`);
    }

    // 4. Asignar boletas por fecha más cercana
    console.log('\n--- Asignando boletas por cercanía de fecha ---\n');
    const usedTxIds = new Set<string>();
    const usedBoletas = new Set<number>();
    let assigned = 0;

    // Ordenar boletas por fecha
    const sortedEntries = [...rafaelEntries].sort((a, b) => a.fechaPago.getTime() - b.fechaPago.getTime());

    for (const entry of sortedEntries) {
        const entryTime = entry.fechaPago.getTime();
        
        const candidates = allRafaelTxs
            .filter(t => !usedTxIds.has(t.id))
            .sort((a, b) =>
                Math.abs(new Date(a.date).getTime() - entryTime) -
                Math.abs(new Date(b.date).getTime() - entryTime)
            );

        if (candidates.length === 0) {
            console.log(`  ⚠️ Sin tx para Boleta #${entry.boleta} (${entry.fechaPago.toISOString().split('T')[0]})`);
            continue;
        }

        const bestTx = candidates[0];
        const daysDiff = Math.abs(new Date(bestTx.date).getTime() - entryTime) / (86400 * 1000);

        // Solo asignar si la diferencia es razonable (< 15 días)
        if (daysDiff > 15) {
            console.log(`  ⚠️ Boleta #${entry.boleta} (${entry.fechaPago.toISOString().split('T')[0]}) - candidata más cercana tiene ${daysDiff.toFixed(0)}d de diferencia, se omite`);
            continue;
        }

        const meta = (bestTx.metadata as Record<string, any>) || {};
        meta.boletaHonorarios = entry.boleta;
        meta.providerId = RAFAEL_PROVIDER_ID;
        meta.providerName = 'Rafael Fuentes';
        
        // Solo actualizar reviewNote si está UNMATCHED (no tocar MATCHED que ya tiene su nota)
        if (bestTx.status !== 'MATCHED') {
            meta.reviewNote = `RAFAEL FUENTES | Boleta #${entry.boleta}`;
            meta.reviewedAt = new Date().toISOString();
        }

        await prisma.bankTransaction.update({
            where: { id: bestTx.id },
            data: { metadata: meta }
        });

        usedTxIds.add(bestTx.id);
        usedBoletas.add(entry.boleta);
        assigned++;
        console.log(`  ✅ #${entry.boleta} → ${bestTx.date.toISOString().split('T')[0]} [${bestTx.status}] "${bestTx.description}" (${daysDiff.toFixed(0)}d)`);
    }

    // 5. Mostrar boletas no asignadas y tx sin boleta
    console.log('\n--- Boletas NO asignadas ---');
    const unassigned = rafaelEntries.filter(e => !usedBoletas.has(e.boleta));
    for (const e of unassigned) {
        console.log(`  #${e.boleta} - ${e.fechaPago.toISOString().split('T')[0]} [${e.sheet}]`);
    }

    console.log('\n--- Tx Rafael SIN boleta ---');
    const txWithoutBoleta = allRafaelTxs.filter(t => !usedTxIds.has(t.id));
    for (const t of txWithoutBoleta) {
        console.log(`  ${t.date.toISOString().split('T')[0]} [${t.status}] "${t.description}"`);
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`  Boletas en Excel: ${rafaelEntries.length}`);
    console.log(`  Transacciones Rafael: ${allRafaelTxs.length}`);
    console.log(`  Asignadas correctamente: ${assigned}`);
    console.log(`  Sin asignar: ${unassigned.length}`);

    await prisma.$disconnect();
}
main().catch(console.error);
