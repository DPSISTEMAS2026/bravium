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
    // Re-run audit to get the remaining issues
    const wb = XLSX.readFile('scripts/Pagos 2026 (3) (1).xlsx');
    const monthSheets = wb.SheetNames.filter(s => /ENERO|FEBRERO|MARZO|ABRIL/i.test(s));

    const byFolio: Record<number, { empresa: string; entries: { monto: number; sheet: string; fecha: string; row: number; comentario: string; banco: string }[] }> = {};
    for (const sheetName of monthSheets) {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0]) continue;
            const folio = r[3] ? Number(r[3]) : null;
            const monto = Number(r[5]) || 0;
            if (!folio || isNaN(folio) || folio >= 2147483647 || monto === 0) continue;
            if (!byFolio[folio]) byFolio[folio] = { empresa: String(r[0]), entries: [] };
            byFolio[folio].entries.push({
                monto, sheet: sheetName, row: i + 1,
                fecha: typeof r[6] === 'number' ? excelDateToISO(r[6]) : '',
                comentario: String(r[8] || ''),
                banco: String(r[7] || ''),
            });
        }
    }

    // Get all remaining issues (DTEs that are NOT PAID)
    const folios = Object.keys(byFolio).map(Number);
    const allDtes = await p.dTE.findMany({
        where: { folio: { in: folios }, provider: { organizationId: ORG }, paymentStatus: { not: 'PAID' } },
        include: { provider: { select: { name: true, rut: true } } },
    });

    console.log(`\n═══ INVESTIGACIÓN PROFUNDA: ${allDtes.length} DTEs aún no PAID ═══\n`);

    for (const dte of allDtes.sort((a, b) => b.outstandingAmount - a.outstandingAmount)) {
        const excel = byFolio[dte.folio];
        if (!excel) continue;

        // Get existing matches
        const existingMatches = await p.reconciliationMatch.findMany({
            where: { dteId: dte.id },
            include: { transaction: { select: { id: true, amount: true, description: true, date: true, status: true } } },
        });
        const matchedTxIds = new Set(existingMatches.map(m => m.transactionId).filter(Boolean));
        const confirmedSum = existingMatches
            .filter(m => m.status === 'CONFIRMED')
            .reduce((s, m) => s + Math.abs(m.transaction?.amount || 0), 0);
        const remaining = dte.totalAmount - confirmedSum;

        console.log(`────────────────────────────────────────`);
        console.log(`📄 Folio ${dte.folio} | ${dte.provider?.name}`);
        console.log(`   DTE: total=${fmt(dte.totalAmount)} outstanding=${fmt(dte.outstandingAmount)} status=${dte.paymentStatus}`);
        console.log(`   Matches existentes: ${existingMatches.length} (confirmed sum: ${fmt(confirmedSum)}) → falta: ${fmt(remaining)}`);
        console.log(`   RUT proveedor: ${dte.provider?.rut || 'N/A'}`);

        for (const entry of excel.entries) {
            console.log(`   📋 Excel: ${entry.sheet} row ${entry.row} | ${fmt(entry.monto)} | fecha: ${entry.fecha} | ${entry.banco} | ${entry.comentario}`);
        }

        // Unmatched Excel amounts: figure out which entries don't have a confirmed match
        const unmatchedEntries: typeof excel.entries = [];
        const matchedAmounts = existingMatches
            .filter(m => m.status === 'CONFIRMED')
            .map(m => Math.abs(m.transaction?.amount || 0));

        // Simple greedy matching of Excel entries to confirmed match amounts
        const usedMatchIdx = new Set<number>();
        for (const entry of excel.entries) {
            let found = false;
            for (let i = 0; i < matchedAmounts.length; i++) {
                if (usedMatchIdx.has(i)) continue;
                if (Math.abs(matchedAmounts[i] - entry.monto) <= 100) { // Allow $100 tolerance
                    usedMatchIdx.add(i);
                    found = true;
                    break;
                }
            }
            if (!found) unmatchedEntries.push(entry);
        }

        if (unmatchedEntries.length === 0) {
            console.log(`   ✅ Todos los pagos del Excel tienen match — solo falta actualizar outstanding`);
            continue;
        }

        console.log(`   🔎 Buscando ${unmatchedEntries.length} pago(s) sin match...`);

        for (const entry of unmatchedEntries) {
            const targetAmount = -entry.monto;
            const paymentDate = entry.fecha ? new Date(entry.fecha) : null;
            const rutClean = dte.provider?.rut?.replace(/\./g, '').split('-')[0] || '';

            // Search 1: Exact amount, any status, wide date range
            const exactAny = await p.bankTransaction.findMany({
                where: {
                    bankAccount: { organizationId: ORG },
                    amount: targetAmount,
                    id: { notIn: Array.from(matchedTxIds) as string[] },
                    ...(paymentDate ? {
                        date: {
                            gte: new Date(paymentDate.getTime() - 30 * 86400000),
                            lte: new Date(paymentDate.getTime() + 30 * 86400000),
                        }
                    } : {
                        date: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') }
                    }),
                },
                include: { matches: { select: { id: true, status: true, dteId: true } } },
                take: 5,
            }) as any[];

            // Search 2: RUT in description
            const byRut = rutClean ? await p.bankTransaction.findMany({
                where: {
                    bankAccount: { organizationId: ORG },
                    description: { contains: rutClean },
                    id: { notIn: Array.from(matchedTxIds) as string[] },
                    date: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
                    type: 'DEBIT',
                },
                include: { matches: { select: { id: true, status: true, dteId: true } } },
                take: 10,
            }) as any[] : [];

            // Search 3: Close amount (within 5%)
            const closeAmount = await p.bankTransaction.findMany({
                where: {
                    bankAccount: { organizationId: ORG },
                    amount: { gte: targetAmount * 1.05, lte: targetAmount * 0.95 },
                    status: { in: ['PENDING', 'UNMATCHED'] },
                    id: { notIn: Array.from(matchedTxIds) as string[] },
                    ...(paymentDate ? {
                        date: {
                            gte: new Date(paymentDate.getTime() - 15 * 86400000),
                            lte: new Date(paymentDate.getTime() + 15 * 86400000),
                        }
                    } : {}),
                },
                take: 5,
            }) as any[];

            console.log(`\n   💸 Buscando ${fmt(entry.monto)} (~${entry.fecha}):`);

            if (exactAny.length > 0) {
                console.log(`   🎯 EXACT AMOUNT encontradas (${exactAny.length}):`);
                for (const tx of exactAny) {
                    const matchInfo = tx.matches?.length > 0 
                        ? `⚠️ YA MATCHED (${tx.matches.length} match: ${tx.matches.map((m: any) => m.status).join(',')})` 
                        : `✅ LIBRE (${tx.status})`;
                    console.log(`      ${tx.date?.toISOString().slice(0,10)} | ${fmt(tx.amount)} | "${tx.description?.substring(0,50)}" | ${matchInfo}`);
                }
            }

            if (byRut.length > 0) {
                const unshown = byRut.filter((tx: any) => !exactAny.find((e: any) => e.id === tx.id));
                if (unshown.length > 0) {
                    console.log(`   🔍 POR RUT (${rutClean}) — otras TX al mismo proveedor:`);
                    for (const tx of unshown.slice(0, 5)) {
                        const matchInfo = tx.matches?.length > 0 
                            ? `⚠️ MATCHED` 
                            : `✅ LIBRE (${tx.status})`;
                        console.log(`      ${tx.date?.toISOString().slice(0,10)} | ${fmt(tx.amount)} | "${tx.description?.substring(0,50)}" | ${matchInfo}`);
                    }
                }
            }

            if (closeAmount.length > 0 && exactAny.length === 0) {
                console.log(`   📐 MONTO CERCANO (±5%):`);
                for (const tx of closeAmount) {
                    console.log(`      ${tx.date?.toISOString().slice(0,10)} | ${fmt(tx.amount)} | "${tx.description?.substring(0,50)}" | diff: ${fmt(Math.abs(tx.amount) - entry.monto)}`);
                }
            }

            if (exactAny.length === 0 && byRut.length === 0 && closeAmount.length === 0) {
                console.log(`   ❌ NO SE ENCONTRÓ NINGUNA TX CANDIDATA`);
            }
        }
        console.log('');
    }
}

main().catch(console.error).finally(() => p.$disconnect());
