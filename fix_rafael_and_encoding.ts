import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function excelDateToJS(serial: number): Date {
    const utcDays = Math.floor(serial - 25569);
    return new Date(utcDays * 86400 * 1000);
}

async function main() {
    console.log('=== ASIGNAR BOLETAS DE RAFAEL + LIMPIAR ENCODING ===\n');

    const RAFAEL_PROVIDER_ID = '66cc095c-7bb2-4ca0-87cf-4dfa2e09c8fa';

    // =============================================
    // PARTE 1: Asignar boletas de Rafael desde Excel
    // =============================================
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');
    
    // Recopilar TODAS las entradas de Rafael con boleta de TODAS las pestañas
    const rafaelEntries: { boleta: number; fechaPago: Date; amount: number; sheet: string }[] = [];
    
    for (const sheetName of workbook.SheetNames) {
        const sheetData = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: "" });
        for (const r of sheetData) {
            const item = String(r['Item'] || '').toUpperCase();
            if (!item.includes('RAFAEL')) continue;
            
            const boleta = Number(r['Boleta\xa0']);
            const valor = Number(r[' Valor ']);
            const fechaRaw = r['Fecha de Pago'];
            
            if (isNaN(boleta) || boleta <= 0) continue;
            if (isNaN(valor) || valor <= 0) continue;
            
            const fecha = typeof fechaRaw === 'number' ? excelDateToJS(fechaRaw) : new Date();
            rafaelEntries.push({ boleta, fechaPago: fecha, amount: valor, sheet: sheetName });
        }
    }

    console.log(`Encontradas ${rafaelEntries.length} boletas de Rafael en el Excel:\n`);
    for (const e of rafaelEntries) {
        console.log(`  Boleta #${e.boleta} - $${e.amount} - Fecha: ${e.fechaPago.toISOString().split('T')[0]} [${e.sheet}]`);
    }

    // Buscar transacciones UNMATCHED de Rafael ($300.000 a RUT 16.751.160-0)
    const rafaelTxs = await prisma.bankTransaction.findMany({
        where: {
            status: 'UNMATCHED',
            amount: -300000,
        },
        orderBy: { date: 'asc' }
    });

    console.log(`\nTransacciones UNMATCHED de $-300.000: ${rafaelTxs.length}\n`);

    // Asignar cada boleta a la transacción más cercana en fecha
    let assignedBoletas = 0;
    const usedTxIds = new Set<string>();

    for (const entry of rafaelEntries) {
        const entryTime = entry.fechaPago.getTime();
        
        // Buscar la tx más cercana a la fecha del Excel que no haya sido usada
        const candidates = rafaelTxs
            .filter(t => !usedTxIds.has(t.id))
            .sort((a, b) => 
                Math.abs(new Date(a.date).getTime() - entryTime) - 
                Math.abs(new Date(b.date).getTime() - entryTime)
            );

        if (candidates.length === 0) continue;
        
        const bestTx = candidates[0];
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

        // Guardar alias del proveedor para futuras cargas
        try {
            await prisma.providerAlias.upsert({
                where: {
                    description_providerId: {
                        description: bestTx.description,
                        providerId: RAFAEL_PROVIDER_ID
                    }
                },
                update: {},
                create: {
                    description: bestTx.description,
                    providerId: RAFAEL_PROVIDER_ID
                }
            });
        } catch (e) { /* alias ya existe, ok */ }

        usedTxIds.add(bestTx.id);
        assignedBoletas++;
        console.log(`  ✅ Boleta #${entry.boleta} → Tx $${bestTx.amount} del ${bestTx.date.toISOString().split('T')[0]} "${bestTx.description}"`);
    }

    console.log(`\n${assignedBoletas} boletas de Rafael asignadas.\n`);

    // =============================================
    // PARTE 2: Limpiar encoding roto - revertir las que SOLO dicen "Factura electrÃ³nica"
    // =============================================
    console.log('--- Limpiando encoding roto ---\n');
    
    const allUnmatched = await prisma.bankTransaction.findMany({ where: { status: 'UNMATCHED' } });
    let revertedEncoding = 0;
    let cleanedEncoding = 0;

    for (const tx of allUnmatched) {
        const meta = (tx.metadata as Record<string, any>) || {};
        const note = String(meta.reviewNote || '');
        
        // Si el note contiene el encoding roto, limpiar
        if (note.includes('electrÃ³nica')) {
            const cleaned = note.replace(/electrÃ³nica/g, 'electrónica');
            meta.reviewNote = cleaned;
            
            // Si SOLO dice "Factura electrónica" sin nombre de proveedor → revertir a PENDING
            const withoutFactura = cleaned.replace(/Factura electrónica/gi, '').replace(/\|/g, '').trim();
            if (withoutFactura.length < 3 || withoutFactura === '(sin detalle en Excel)') {
                delete meta.reviewNote;
                delete meta.excelItem;
                delete meta.excelDetalle;
                delete meta.excelComentario;
                delete meta.excelFechaPago;
                delete meta.reviewedAt;
                
                await prisma.bankTransaction.update({
                    where: { id: tx.id },
                    data: { status: 'PENDING', metadata: meta }
                });
                revertedEncoding++;
                console.log(`  ⏪ REVERTIDO: $${tx.amount} (${tx.date.toISOString().split('T')[0]}) - "${note}"`);
            } else {
                // Tiene proveedor útil, solo limpiar el encoding
                await prisma.bankTransaction.update({
                    where: { id: tx.id },
                    data: { metadata: meta }
                });
                cleanedEncoding++;
                console.log(`  ✏️ ENCODING FIJO: $${tx.amount} → "${cleaned}"`);
            }
        }
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`  Boletas Rafael asignadas:    ${assignedBoletas}`);
    console.log(`  Encoding limpiado:           ${cleanedEncoding}`);
    console.log(`  Revertidos a PENDING:        ${revertedEncoding}`);
    
    const finalPending = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    const finalUnmatched = await prisma.bankTransaction.count({ where: { status: 'UNMATCHED' } });
    console.log(`\n  Estado: ${finalPending} PENDING, ${finalUnmatched} UNMATCHED`);

    await prisma.$disconnect();
}
main().catch(console.error);
