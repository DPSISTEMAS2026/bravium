import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const p = new PrismaClient();
const ORG = '715545b8-4522-4bb1-be81-3047546c0e8c';
const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);

function excelDateToISO(serial: number): string {
    if (!serial || typeof serial !== 'number') return '';
    const d = new Date((serial - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
}

async function main() {
    const wb = XLSX.readFile('scripts/Pagos 2026 (3) (1).xlsx');
    const monthSheets = wb.SheetNames.filter(s => /ENERO|FEBRERO|MARZO|ABRIL/i.test(s));
    console.log('Procesando hojas:', monthSheets);

    // Parse Excel
    const byFolio: Record<number, { empresa: string; entries: { monto: number; sheet: string; fecha: string }[] }> = {};

    for (const sheetName of monthSheets) {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0]) continue;
            const folio = r[3] ? Number(r[3]) : null;
            const monto = Number(r[5]) || 0;
            if (!folio || isNaN(folio) || monto === 0) continue;
            if (!byFolio[folio]) byFolio[folio] = { empresa: String(r[0]), entries: [] };
            byFolio[folio].entries.push({
                monto,
                sheet: sheetName,
                fecha: typeof r[6] === 'number' ? excelDateToISO(r[6]) : String(r[6] || ''),
            });
        }
    }

    const uniqueFolios = Object.keys(byFolio).map(Number).filter(f => f > 0 && f < 2147483647);
    console.log(`\nTotal pagos en Excel: ${Object.values(byFolio).reduce((s, f) => s + f.entries.length, 0)}`);
    console.log(`Folios únicos (válidos): ${uniqueFolios.length}`);

    // Batch query: get ALL DTEs for these folios at once
    const allDtes = await p.dTE.findMany({
        where: {
            folio: { in: uniqueFolios },
            provider: { organizationId: ORG },
        },
        select: { id: true, folio: true, totalAmount: true, outstandingAmount: true, paymentStatus: true },
    });
    const dteMap: Record<number, typeof allDtes[0]> = {};
    for (const d of allDtes) dteMap[d.folio] = d;

    // Batch query: get ALL matches for these DTEs
    const dteIds = allDtes.map(d => d.id);
    const allMatches = await p.reconciliationMatch.findMany({
        where: { dteId: { in: dteIds } },
        select: { dteId: true, status: true },
    });
    const matchesByDte: Record<string, { total: number; confirmed: number }> = {};
    for (const m of allMatches) {
        if (!m.dteId) continue;
        if (!matchesByDte[m.dteId]) matchesByDte[m.dteId] = { total: 0, confirmed: 0 };
        matchesByDte[m.dteId].total++;
        if (m.status === 'CONFIRMED') matchesByDte[m.dteId].confirmed++;
    }

    // Analyze
    const issues: { folio: number; empresa: string; excelTotal: number; excelCount: number; dbStatus: string; dbOutstanding: number; matchTotal: number; matchConfirmed: number; issue: string }[] = [];

    for (const folio of uniqueFolios) {
        const excel = byFolio[folio];
        const excelTotal = excel.entries.reduce((s, e) => s + e.monto, 0);
        const dte = dteMap[folio];

        if (!dte) {
            issues.push({ folio, empresa: excel.empresa, excelTotal, excelCount: excel.entries.length, dbStatus: 'NO EXISTE', dbOutstanding: 0, matchTotal: 0, matchConfirmed: 0, issue: '❌ DTE NO EXISTE EN SISTEMA' });
            continue;
        }

        const mm = matchesByDte[dte.id] || { total: 0, confirmed: 0 };

        if (dte.paymentStatus === 'PAID') continue; // OK

        // UNPAID or PARTIAL but Excel says it's paid
        let issue = '';
        if (mm.total === 0) {
            issue = '🔴 SIN MATCH — pagado según Excel pero sin ninguna conciliación';
        } else if (mm.confirmed === 0) {
            issue = '🟡 MATCHES DRAFT/REJECTED — ninguno confirmado';
        } else if (mm.confirmed < excel.entries.length) {
            issue = `🟠 PARCIAL — Excel tiene ${excel.entries.length} pagos, solo ${mm.confirmed} confirmed`;
        } else {
            issue = `🔵 OUTSTANDING NO ACTUALIZADO — ${mm.confirmed} match(es) confirmed pero status=${dte.paymentStatus}`;
        }

        issues.push({ folio, empresa: excel.empresa, excelTotal, excelCount: excel.entries.length, dbStatus: dte.paymentStatus, dbOutstanding: dte.outstandingAmount, matchTotal: mm.total, matchConfirmed: mm.confirmed, issue });
    }

    // Report
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  FOLIOS DEL EXCEL QUE NO ESTÁN CUBIERTOS EN EL SISTEMA');
    console.log('════════════════════════════════════════════════════════════\n');

    const noExiste = issues.filter(i => i.dbStatus === 'NO EXISTE');
    const sinMatch = issues.filter(i => i.issue.startsWith('🔴'));
    const draftOnly = issues.filter(i => i.issue.startsWith('🟡'));
    const parcial = issues.filter(i => i.issue.startsWith('🟠'));
    const outstandingBug = issues.filter(i => i.issue.startsWith('🔵'));

    console.log(`✅ Folios OK (PAID): ${uniqueFolios.length - issues.length} / ${uniqueFolios.length}`);
    console.log(`❌ DTE no existe en BD: ${noExiste.length}`);
    console.log(`🔴 Sin ningún match: ${sinMatch.length}`);
    console.log(`🟡 Solo drafts/rejected: ${draftOnly.length}`);
    console.log(`🟠 Matches parciales: ${parcial.length}`);
    console.log(`🔵 Outstanding no actualizado: ${outstandingBug.length}`);
    console.log(`\nTotal issues: ${issues.length}`);

    // Print details sorted by amount
    issues.sort((a, b) => b.excelTotal - a.excelTotal);
    
    if (issues.length > 0) {
        console.log('\n─── DETALLE (top 50 por monto) ───\n');
        for (const i of issues.slice(0, 50)) {
            console.log(`${i.issue}`);
            console.log(`  Folio ${i.folio} | ${i.empresa} | Excel: ${i.excelCount} pago(s) = ${fmt(i.excelTotal)}`);
            if (i.dbStatus !== 'NO EXISTE') {
                console.log(`  BD: status=${i.dbStatus} | outstanding=${fmt(i.dbOutstanding)} | matches: ${i.matchTotal} (${i.matchConfirmed} confirmed)`);
            }
            console.log('');
        }

        const totalMissing = issues.reduce((s, i) => s + i.excelTotal, 0);
        console.log(`\n💰 MONTO TOTAL NO CUBIERTO: ${fmt(totalMissing)}`);
    }
}

main().catch(console.error).finally(() => p.$disconnect());
