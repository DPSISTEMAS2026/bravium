import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const p = new PrismaClient();
const ORG = '715545b8-4522-4bb1-be81-3047546c0e8c';

async function main() {
    // 1. Read Excel — March sheet
    const wb = XLSX.readFile('scripts/Pagos 2026 (3) (1).xlsx');
    console.log('Hojas disponibles:', wb.SheetNames);
    
    // Find March sheet
    const marSheet = wb.SheetNames.find(s => s.toLowerCase().includes('mar'));
    if (!marSheet) {
        console.log('No encontré hoja de Marzo, probando todas...');
        for (const name of wb.SheetNames) {
            const ws = wb.Sheets[name];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
            console.log(`\n--- Hoja: ${name} (${data.length} filas) ---`);
            if (data.length > 0) console.log('Headers:', data[0]);
            // Look for LATAM rows
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                if (row && row.some((cell: any) => String(cell).toUpperCase().includes('LATAM'))) {
                    console.log(`  Row ${i}:`, row);
                }
            }
        }
    } else {
        const ws = wb.Sheets[marSheet];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        console.log(`\n═══ Hoja: ${marSheet} (${data.length} filas) ═══`);
        console.log('Headers:', data[0]);
        
        // Find all LATAM rows
        console.log('\nFilas con LATAM:');
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (row && row.some((cell: any) => String(cell).toUpperCase().includes('LATAM'))) {
                console.log(`  Row ${i}:`, JSON.stringify(row));
            }
        }
    }
    
    // 2. Check DB — LATAM DTEs
    console.log('\n═══ DTEs de LATAM en BD (2026) ═══');
    const latamDtes = await p.dTE.findMany({
        where: {
            provider: { 
                organizationId: ORG,
                name: { contains: 'LATAM', mode: 'insensitive' }
            },
            issuedDate: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
        },
        include: { provider: { select: { name: true } } },
        orderBy: { issuedDate: 'asc' },
    });
    
    const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);
    
    console.log(`Total DTEs LATAM 2026: ${latamDtes.length}`);
    latamDtes.forEach(d => {
        console.log(`  Folio ${d.folio} | ${d.issuedDate?.toISOString().slice(0,10)} | ${fmt(d.totalAmount)} | outstanding: ${fmt(d.outstandingAmount)} | status: ${d.paymentStatus}`);
    });
    
    // 3. Check matches for LATAM
    console.log('\n═══ Matches de LATAM DTEs ═══');
    for (const d of latamDtes) {
        const matches = await p.reconciliationMatch.findMany({
            where: { dteId: d.id },
            include: { transaction: { select: { amount: true, description: true, date: true } } },
        });
        if (matches.length > 0) {
            console.log(`  Folio ${d.folio}: ${matches.length} matches`);
            matches.forEach(m => {
                console.log(`    → ${m.status} | ${m.transaction?.date?.toISOString().slice(0,10)} | ${fmt(m.transaction?.amount || 0)} | ${m.transaction?.description?.substring(0,40)}`);
            });
        } else {
            console.log(`  Folio ${d.folio}: SIN MATCHES`);
        }
    }
    
    // 4. Check TX to LATAM (89.862.200-2)
    console.log('\n═══ TX a RUT 89.862.200 (LATAM) ═══');
    const latamTx = await p.bankTransaction.findMany({
        where: {
            bankAccount: { organizationId: ORG },
            date: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
            description: { contains: '89.862.200', mode: 'insensitive' },
        },
        orderBy: { date: 'asc' },
    });
    console.log(`Transacciones a RUT LATAM: ${latamTx.length}`);
    latamTx.forEach(t => {
        console.log(`  ${t.date?.toISOString().slice(0,10)} | ${fmt(t.amount)} | status: ${t.status} | ${t.description?.substring(0,60)}`);
    });
}
main().catch(console.error).finally(() => p.$disconnect());
