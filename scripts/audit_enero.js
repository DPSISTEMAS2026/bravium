const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const utc_days = Math.floor(serial - 25569);
  return new Date(utc_days * 86400 * 1000);
}

async function main() {
  const wb = XLSX.readFile('scripts/Pagos 2026 (3) (1).xlsx');
  const sheet = wb.Sheets['ENERO 2026'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Cuentas bancarias
  const accounts = await p.bankAccount.findMany({ select: { id: true, bankName: true } });
  const accName = (id) => accounts.find(a => a.id === id)?.bankName || '???';

  // Filtrar filas con folio (col 3)
  const folioRows = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[3]) continue; // Sin folio = no es factura
    const folio = parseInt(row[3]);
    if (isNaN(folio)) continue;
    
    const item = row[0] || '';
    const valor = row[5] || 0;
    const fechaPagoRaw = row[6];
    const banco = row[7] || '';
    const fechaPago = excelDateToJS(fechaPagoRaw);
    
    folioRows.push({ i, item, folio, valor, fechaPago, banco });
  }

  console.log(`\n${'═'.repeat(120)}`);
  console.log(`  AUDITORÍA ENERO 2026 — ${folioRows.length} folios con factura en el Excel`);
  console.log(`${'═'.repeat(120)}\n`);

  let ok = 0, mismatch = 0, noMatch = 0, wrongDate = 0;
  const problems = [];

  for (const fr of folioRows) {
    // Buscar DTE en BD
    const dte = await p.dTE.findFirst({
      where: { folio: fr.folio },
      include: {
        provider: { select: { name: true } },
        matches: {
          where: { status: 'CONFIRMED' },
          include: {
            transaction: {
              select: { id: true, date: true, amount: true, description: true, bankAccountId: true, status: true }
            }
          }
        }
      }
    });

    const excelDate = fr.fechaPago ? fr.fechaPago.toISOString().substring(0, 10) : '???';
    const excelBanco = fr.banco.substring(0, 30);
    const provName = (dte?.provider?.name || fr.item).substring(0, 28).padEnd(28);
    const matchCount = dte?.matches?.length || 0;

    if (!dte) {
      console.log(`  ❓ Folio ${String(fr.folio).padStart(8)} | ${provName} | $${String(fr.valor).padStart(12)} | Excel: ${excelDate} ${excelBanco.padEnd(30)} | DTE NO ENCONTRADO EN BD`);
      problems.push({ folio: fr.folio, type: 'NO_DTE', detail: 'DTE no existe en BD' });
      noMatch++;
      continue;
    }

    if (matchCount === 0) {
      console.log(`  ⚠️  Folio ${String(fr.folio).padStart(8)} | ${provName} | $${String(fr.valor).padStart(12)} | Excel: ${excelDate} ${excelBanco.padEnd(30)} | SIN MATCH en BD [${dte.paymentStatus}]`);
      problems.push({ folio: fr.folio, type: 'NO_MATCH', detail: `Sin match, estado: ${dte.paymentStatus}` });
      noMatch++;
      continue;
    }

    // Tiene match — verificar coherencia
    const match = dte.matches[0];
    const tx = match.transaction;
    const txDate = tx.date.toISOString().substring(0, 10);
    const txBank = accName(tx.bankAccountId);
    const txAmount = Math.abs(tx.amount);

    // Verificar banco
    const excelBancoNorm = fr.banco.toUpperCase();
    let bancoOk = true;
    if (excelBancoNorm.includes('TC') || excelBancoNorm.includes('TARJETA')) {
      if (!txBank.includes('TC')) bancoOk = false;
    } else if (excelBancoNorm.includes('TRANSFERENCIA') || excelBancoNorm.includes('CUENTA')) {
      if (txBank.includes('TC')) bancoOk = false; // Debería ser CC no TC
    }

    // Verificar fecha (tolerancia de 5 días)
    let dateOk = true;
    if (fr.fechaPago) {
      const diffDays = Math.abs(Math.round((tx.date - fr.fechaPago) / (1000*60*60*24)));
      if (diffDays > 15) {
        dateOk = false;
      }
    }

    // Verificar monto
    const montoOk = Math.abs(txAmount - fr.valor) < 100; // tolerancia $100

    if (bancoOk && dateOk && montoOk) {
      console.log(`  ✅ Folio ${String(fr.folio).padStart(8)} | ${provName} | $${String(fr.valor).padStart(12)} | Excel: ${excelDate} ${excelBanco.padEnd(30)} | BD: ${txDate} ${txBank.padEnd(20)} | OK`);
      ok++;
    } else {
      const flags = [];
      if (!bancoOk) flags.push(`BANCO: Excel=${excelBancoNorm.substring(0,15)} BD=${txBank}`);
      if (!dateOk) flags.push(`FECHA: Excel=${excelDate} BD=${txDate}`);
      if (!montoOk) flags.push(`MONTO: Excel=$${fr.valor} BD=$${txAmount}`);
      
      console.log(`  🔴 Folio ${String(fr.folio).padStart(8)} | ${provName} | $${String(fr.valor).padStart(12)} | Excel: ${excelDate} ${excelBanco.padEnd(30)} | BD: ${txDate} ${txBank.padEnd(20)} | ${flags.join(' | ')}`);
      problems.push({ folio: fr.folio, type: 'MISMATCH', detail: flags.join(' | ') });
      mismatch++;
    }
  }

  console.log(`\n${'─'.repeat(120)}`);
  console.log(`  RESUMEN ENERO:`);
  console.log(`  ✅ OK: ${ok} | 🔴 Discrepancia: ${mismatch} | ⚠️  Sin match: ${noMatch}`);
  console.log(`${'─'.repeat(120)}`);

  if (problems.length > 0) {
    console.log(`\n  PROBLEMAS A RESOLVER:`);
    problems.forEach((p, i) => {
      console.log(`  ${i+1}. Folio ${p.folio}: [${p.type}] ${p.detail}`);
    });
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
