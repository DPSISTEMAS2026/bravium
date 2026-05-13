const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const utc_days = Math.floor(serial - 25569);
  return new Date(utc_days * 86400 * 1000);
}

// ============= FIXES MARZO (basado en auditoría previa) =============
const MARZO_FIXES = [
  { folio: 44639,    excelDate: '2026-03-02', excelAmount: 47600,    problem: 'TX abr, debería mar' },
  { folio: 6723,     excelDate: '2026-03-02', excelAmount: 63963,    problem: 'TX feb, debería mar' },
  { folio: 10661,    excelDate: '2026-03-02', excelAmount: 259984,   problem: 'TX feb + monto diff' },
  { folio: 843,      excelDate: '2026-03-10', excelAmount: 198900,   problem: 'TX ene, debería mar' },
  { folio: 842,      excelDate: '2026-03-10', excelAmount: 216900,   problem: 'TX ene, debería mar' },
  { folio: 22010,    excelDate: '2026-03-10', excelAmount: 15920,    problem: 'TX abr, debería mar' },
  { folio: 355,      excelDate: '2026-03-10', excelAmount: 19999,    problem: 'TX mar 31, desfase' },
  { folio: 7192,     excelDate: '2026-03-10', excelAmount: 9790833,  problem: 'TX ene $7M, debería mar $9.7M' },
  { folio: 22146,    excelDate: '2026-03-20', excelAmount: 47840,    problem: 'TX feb, debería mar' },
  { folio: 1271461,  excelDate: '2026-03-20', excelAmount: 2960256,  problem: 'TX feb, debería mar' },
  { folio: 894428,   excelDate: '2026-03-20', excelAmount: 466626,   problem: 'TX abr, debería mar' },
  { folio: 5583453,  excelDate: '2026-03-20', excelAmount: 1564730,  problem: 'Monto $594K vs $1.5M' },
  { folio: 5419109,  excelDate: '2026-03-24', excelAmount: 5764013,  problem: 'Monto $15M vs $5.7M' },
];

async function fixBatch(label, fixes) {
  console.log(`\n${'═'.repeat(110)}`);
  console.log(`  CORRECCIÓN ${label} — ${fixes.length} folios`);
  console.log(`${'═'.repeat(110)}\n`);

  let fixed = 0, removed = 0, accepted = 0;

  for (const fix of fixes) {
    // Skip folios > INT4 max
    if (fix.folio > 2147483647) {
      console.log(`  ⏭️  Folio ${fix.folio}: demasiado grande para INT4, saltando`);
      continue;
    }

    const dte = await p.dTE.findFirst({
      where: { folio: fix.folio },
      include: {
        provider: { select: { name: true } },
        matches: {
          where: { status: 'CONFIRMED' },
          include: { transaction: { select: { id: true, date: true, amount: true, description: true } } }
        }
      }
    });

    if (!dte) { console.log(`  ❓ Folio ${fix.folio}: no encontrado`); continue; }

    const provName = (dte.provider?.name || '???').substring(0, 28).padEnd(28);
    const currentMatch = dte.matches[0];
    if (!currentMatch) {
      console.log(`  ℹ️  Folio ${String(fix.folio).padStart(8)} | ${provName} | Sin match — nada que corregir`);
      continue;
    }

    const currentTxId = currentMatch.transaction?.id;
    const currentTxDate = currentMatch.transaction?.date?.toISOString()?.substring(0, 10) || 'N/A';
    const currentTxAmt = Math.abs(currentMatch.transaction?.amount || 0);

    const excelD = new Date(fix.excelDate);
    const daysDiff = currentMatch.transaction?.date ? Math.abs(Math.round((currentMatch.transaction.date - excelD) / 86400000)) : 999;
    const amtDiffPct = fix.excelAmount > 0 ? Math.abs(currentTxAmt - fix.excelAmount) / fix.excelAmount : 0;

    if (daysDiff <= 15 && amtDiffPct < 0.05) {
      console.log(`  ✅ Folio ${String(fix.folio).padStart(8)} | ${provName} | Match aceptable (${daysDiff}d, ${(amtDiffPct*100).toFixed(1)}%)`);
      accepted++;
      continue;
    }

    // Buscar tx correcta
    const from = new Date(excelD); from.setDate(from.getDate() - 5);
    const to = new Date(excelD); to.setDate(to.getDate() + 10);
    const candidates = await p.bankTransaction.findMany({
      where: {
        date: { gte: from, lte: to },
        OR: [{ amount: fix.excelAmount }, { amount: -fix.excelAmount }],
        id: { not: currentTxId }
      },
      select: { id: true, date: true, amount: true, description: true, status: true },
    });

    const available = [];
    for (const c of candidates) {
      const hasMatch = await p.reconciliationMatch.findFirst({ where: { transactionId: c.id, status: 'CONFIRMED' } });
      if (!hasMatch) available.push(c);
    }

    // Borrar match incorrecto
    await p.balanceAdjustment.updateMany({ where: { matchId: currentMatch.id }, data: { matchId: null } });
    await p.reconciliationMatch.delete({ where: { id: currentMatch.id } });
    if (currentTxId) {
      const otherM = await p.reconciliationMatch.count({ where: { transactionId: currentTxId, status: 'CONFIRMED' } });
      if (otherM === 0) await p.bankTransaction.update({ where: { id: currentTxId }, data: { status: 'PENDING' } });
    }

    if (available.length > 0) {
      const best = available.sort((a, b) => Math.abs(a.date - excelD) - Math.abs(b.date - excelD))[0];
      await p.reconciliationMatch.create({
        data: {
          transactionId: best.id, dteId: dte.id, organizationId: dte.organizationId,
          status: 'CONFIRMED', confidence: 1.0, origin: 'MANUAL',
          notes: `Fix: reasignación auditoría ${label}`, confirmedAt: new Date(),
        }
      });
      await p.bankTransaction.update({ where: { id: best.id }, data: { status: 'MATCHED' } });
      await p.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'PAID', outstandingAmount: 0 } });
      console.log(`  🔧 Folio ${String(fix.folio).padStart(8)} | ${provName} | ${currentTxDate} $${currentTxAmt.toLocaleString()} → ${best.date.toISOString().substring(0,10)} $${Math.abs(best.amount).toLocaleString()} "${best.description?.substring(0,30)}" ✅`);
      fixed++;
    } else {
      await p.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'UNPAID', outstandingAmount: dte.totalAmount } });
      console.log(`  🗑️  Folio ${String(fix.folio).padStart(8)} | ${provName} | BORRADO (${currentTxDate} $${currentTxAmt.toLocaleString()}) → UNPAID`);
      removed++;
    }
  }

  console.log(`\n  ${label}: 🔧 ${fixed} corregidos | 🗑️ ${removed} borrados → UNPAID | ✅ ${accepted} aceptados`);
  return { fixed, removed, accepted };
}

// ============= ABRIL: Auditoría + Fixes =============
async function auditAbril(wb) {
  const sheet = wb.Sheets['ABRIL 2026'];
  if (!sheet) { console.log('No se encontró pestaña ABRIL 2026'); return []; }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const accounts = await p.bankAccount.findMany({ select: { id: true, bankName: true } });
  const accName = (id) => accounts.find(a => a.id === id)?.bankName || '???';

  const folioRows = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[3]) continue;
    const folio = parseInt(row[3]);
    if (isNaN(folio) || folio > 2147483647) continue; // Skip INT4 overflow
    folioRows.push({ item: row[0] || '', folio, valor: row[5] || 0, fechaPago: excelDateToJS(row[6]), banco: row[7] || '' });
  }

  console.log(`\n${'═'.repeat(110)}`);
  console.log(`  AUDITORÍA ABRIL 2026 — ${folioRows.length} folios en Excel`);
  console.log(`${'═'.repeat(110)}\n`);

  let ok = 0, mismatch = 0, noMatch = 0;
  const problems = [];

  for (const fr of folioRows) {
    const dte = await p.dTE.findFirst({
      where: { folio: fr.folio },
      include: {
        provider: { select: { name: true } },
        matches: {
          where: { status: 'CONFIRMED' },
          include: { transaction: { select: { id: true, date: true, amount: true, description: true, bankAccountId: true } } }
        }
      }
    });

    const excelDate = fr.fechaPago ? fr.fechaPago.toISOString().substring(0, 10) : '???';
    const provName = (dte?.provider?.name || fr.item).substring(0, 28).padEnd(28);

    if (!dte) {
      console.log(`  ❓ Folio ${String(fr.folio).padStart(8)} | ${provName} | $${String(fr.valor).padStart(12)} | Excel: ${excelDate} | DTE NO ENCONTRADO`);
      noMatch++; continue;
    }

    if (dte.matches.length === 0) {
      console.log(`  ⚠️  Folio ${String(fr.folio).padStart(8)} | ${provName} | $${String(fr.valor).padStart(12)} | Excel: ${excelDate} | SIN MATCH [${dte.paymentStatus}]`);
      noMatch++; continue;
    }

    const tx = dte.matches[0].transaction;
    const txDate = tx.date.toISOString().substring(0, 10);
    const txBank = accName(tx.bankAccountId);
    const txAmount = Math.abs(tx.amount);

    let dateOk = true;
    if (fr.fechaPago) {
      const diffDays = Math.abs(Math.round((tx.date - fr.fechaPago) / 86400000));
      if (diffDays > 15) dateOk = false;
    }
    const montoOk = Math.abs(txAmount - fr.valor) < Math.max(200, fr.valor * 0.05);

    if (dateOk && montoOk) {
      ok++;
    } else {
      const flags = [];
      if (!dateOk) flags.push(`FECHA: Excel=${excelDate} BD=${txDate}`);
      if (!montoOk) flags.push(`MONTO: Excel=$${fr.valor.toLocaleString()} BD=$${txAmount.toLocaleString()}`);
      console.log(`  🔴 Folio ${String(fr.folio).padStart(8)} | ${provName} | $${String(fr.valor).padStart(12)} | Excel: ${excelDate} | BD: ${txDate} ${txBank.padEnd(20)} | ${flags.join(' | ')}`);
      problems.push({ folio: fr.folio, excelDate, excelAmount: fr.valor, provider: provName.trim(), flags });
      mismatch++;
    }
  }

  console.log(`\n  RESUMEN ABRIL: ✅ ${ok} OK | 🔴 ${mismatch} disc | ⚠️ ${noMatch} sin match | Total: ${folioRows.length}`);
  return problems;
}

async function main() {
  const wb = XLSX.readFile('scripts/Pagos 2026 (3) (1).xlsx');

  // Fix Marzo
  const marResult = await fixBatch('MARZO', MARZO_FIXES);

  // Auditoría + Fix Abril
  const abrProblems = await auditAbril(wb);
  
  // Fix solo los de fecha incorrecta de Abril
  const abrDateFixes = abrProblems
    .filter(p => p.flags?.some(f => f.includes('FECHA')))
    .map(p => ({ folio: p.folio, excelDate: p.excelDate, excelAmount: p.excelAmount, problem: p.flags.join(', ') }));
  
  let abrResult = { fixed: 0, removed: 0, accepted: 0 };
  if (abrDateFixes.length > 0) {
    abrResult = await fixBatch('ABRIL', abrDateFixes);
  } else {
    console.log(`\n  ABRIL: No hay matches de fecha incorrecta para corregir.`);
  }

  console.log(`\n${'═'.repeat(110)}`);
  console.log(`  RESUMEN FINAL`);
  console.log(`${'═'.repeat(110)}`);
  console.log(`  MARZO:  🔧 ${marResult.fixed} fix | 🗑️ ${marResult.removed} borrados | ✅ ${marResult.accepted} ok`);
  console.log(`  ABRIL:  🔧 ${abrResult.fixed} fix | 🗑️ ${abrResult.removed} borrados | ✅ ${abrResult.accepted} ok`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
