const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  return new Date(Math.floor(serial - 25569) * 86400 * 1000);
}

async function auditMonth(sheetName, wb) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const folioRows = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[3]) continue;
    const folio = parseInt(row[3]);
    if (isNaN(folio) || folio > 2147483647) continue;
    folioRows.push({ folio, valor: row[5] || 0, fechaPago: excelDateToJS(row[6]) });
  }

  let ok = 0, mismatchFecha = 0, mismatchMonto = 0, noMatch = 0, paidNoMatch = 0, noDte = 0;

  for (const fr of folioRows) {
    const dte = await p.dTE.findFirst({
      where: { folio: fr.folio },
      include: {
        matches: {
          where: { status: 'CONFIRMED' },
          include: { transaction: { select: { date: true, amount: true } } }
        }
      }
    });

    if (!dte) { noDte++; continue; }
    if (dte.matches.length === 0) {
      if (dte.paymentStatus === 'PAID') paidNoMatch++;
      else noMatch++;
      continue;
    }

    const tx = dte.matches[0].transaction;
    const txAmount = Math.abs(tx.amount);
    let dateOk = true, montoOk = true;
    
    if (fr.fechaPago) {
      const diffDays = Math.abs(Math.round((tx.date - fr.fechaPago) / 86400000));
      if (diffDays > 15) dateOk = false;
    }
    montoOk = Math.abs(txAmount - fr.valor) < Math.max(200, fr.valor * 0.05);

    if (dateOk && montoOk) ok++;
    else if (!dateOk) mismatchFecha++;
    else mismatchMonto++;
  }

  const total = folioRows.length;
  const pct = total > 0 ? ((ok / total) * 100).toFixed(1) : 'N/A';
  return { sheetName, total, ok, mismatchFecha, mismatchMonto, noMatch, paidNoMatch, noDte, pct };
}

async function main() {
  const wb = XLSX.readFile('scripts/Pagos 2026 (3) (1).xlsx');
  const months = ['ENERO 2026', 'FEBRERO 2026', 'MARZO 2026', 'ABRIL 2026'];

  console.log(`\n${'═'.repeat(100)}`);
  console.log(`  VERIFICACIÓN POST-CORRECCIÓN — ¿Concuerda con el Excel?`);
  console.log(`${'═'.repeat(100)}\n`);

  console.log(`  ${'Mes'.padEnd(16)} | Total | ✅ OK  | 🔴Fecha | 🔴Monto | ⚠️NoMatch | ℹ️Paid | ❓NoDTE | %OK`);
  console.log(`  ${'─'.repeat(95)}`);

  let totalAll = 0, okAll = 0;

  for (const m of months) {
    const r = await auditMonth(m, wb);
    if (!r) continue;
    totalAll += r.total;
    okAll += r.ok;
    console.log(`  ${r.sheetName.padEnd(16)} | ${String(r.total).padStart(5)} | ${String(r.ok).padStart(5)}  | ${String(r.mismatchFecha).padStart(7)} | ${String(r.mismatchMonto).padStart(7)} | ${String(r.noMatch).padStart(9)} | ${String(r.paidNoMatch).padStart(5)} | ${String(r.noDte).padStart(7)} | ${r.pct}%`);
  }

  const pctAll = totalAll > 0 ? ((okAll / totalAll) * 100).toFixed(1) : 'N/A';
  console.log(`  ${'─'.repeat(95)}`);
  console.log(`  ${'TOTAL'.padEnd(16)} | ${String(totalAll).padStart(5)} | ${String(okAll).padStart(5)}  |         |         |           |       |         | ${pctAll}%`);

  console.log(`\n  Leyenda:`);
  console.log(`  ✅ OK: Folio con match correcto (fecha ≤15d, monto ≤5%)`);
  console.log(`  🔴Fecha: Match existe pero con tx de mes incorrecto`);
  console.log(`  🔴Monto: Match existe pero monto difiere >5% (pagos agrupados)`);
  console.log(`  ⚠️NoMatch: Sin match, DTE pendiente (UNPAID)`);
  console.log(`  ℹ️Paid: Marcado PAID pero sin match (pagado por otro medio)`);
  console.log(`  ❓NoDTE: Folio del Excel no existe en BD`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
