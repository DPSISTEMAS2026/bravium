import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');
    
    // Dump TODAS las columnas de Rafael en TODAS las pestañas
    console.log('=== RAFAEL EN TODAS LAS PESTAÑAS (todas las columnas) ===\n');
    
    for (const sheetName of workbook.SheetNames) {
        const sheetData = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: "" });
        const rafaelRows = sheetData.filter((r: any) => 
            String(r['Item'] || '').toUpperCase().includes('RAFAEL') ||
            String(r['Detalle'] || '').toUpperCase().includes('RAFAEL')
        );
        
        if (rafaelRows.length > 0) {
            console.log(`\n--- ${sheetName} (${rafaelRows.length} filas de Rafael) ---`);
            console.log('Columnas:', Object.keys(rafaelRows[0]));
            for (const r of rafaelRows) {
                // Dump EVERY key-value pair
                const entries = Object.entries(r);
                const dump: Record<string, any> = {};
                for (const [k, v] of entries) {
                    if (v !== '' && v !== null && v !== undefined) {
                        dump[k] = v;
                    }
                }
                console.log(JSON.stringify(dump));
            }
        }
    }

    // También verificar cuántos UNMATCHED tienen el encoding roto sin proveedor útil
    console.log('\n\n=== UNMATCHED con encoding roto ===');
    const unmatched = await prisma.bankTransaction.findMany({ where: { status: 'UNMATCHED' } });
    for (const tx of unmatched) {
        const meta = (tx.metadata as any) || {};
        const note = String(meta.reviewNote || '');
        if (note.includes('electrÃ') && !note.includes('RAFAEL') && !note.includes('RIDESHOP') 
            && !note.includes('BOOZ') && !note.includes('SODIMAC') && !note.includes('COLEMAN')
            && !note.includes('LUIS MUNOZ') && !note.includes('Ripley') && !note.includes('ARCOVEG')
            && !note.includes('JONATHAN')) {
            console.log(`  $${tx.amount} (${tx.date.toISOString().split('T')[0]}) → "${note}"`);
        }
    }

    await prisma.$disconnect();
}
main().catch(console.error);
