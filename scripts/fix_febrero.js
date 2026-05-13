const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

// Febrero: matches con fecha/monto claramente incorrectos
const FIXES_FEB = [
  // Matches con tx de enero (debería ser febrero)
  { folio: 5415,     excelDate: '2026-02-05', excelAmount: 2133349, problem: 'TX ene, debería feb' },
  { folio: 1260031,  excelDate: '2026-02-17', excelAmount: 1728410, problem: 'TX ene, debería feb' },
  { folio: 26851,    excelDate: '2026-02-05', excelAmount: 767994,  problem: 'TX ene, debería feb' },
  { folio: 6508,     excelDate: '2026-02-05', excelAmount: 552634,  problem: 'TX ene, debería feb' },
  { folio: 10649,    excelDate: '2026-02-17', excelAmount: 84492,   problem: 'TX ene, debería feb' },
  { folio: 6654,     excelDate: '2026-02-05', excelAmount: 63963,   problem: 'TX ene, debería feb' },
  { folio: 52707976, excelDate: '2026-02-02', excelAmount: 89272,   problem: 'TX ene, debería feb' },
  // Monto muy diferente
  { folio: 7138,     excelDate: '2026-02-17', excelAmount: 1720788, problem: 'Monto BD=$15M vs Excel=$1.7M' },
  { folio: 46611,    excelDate: '2026-02-01', excelAmount: 88378,   problem: 'Monto BD=$1M vs Excel=$88K' },
  { folio: 343,      excelDate: '2026-02-05', excelAmount: 26716,   problem: 'TX ene + monto diferente' },
  // SASCO con tx de abril (74 días!)
  { folio: 44125,    excelDate: '2026-02-02', excelAmount: 47600,   problem: 'TX abr, debería feb' },
  // Chilexpress con tx de marzo
  { folio: 13078811, excelDate: '2026-02-17', excelAmount: 19890,   problem: 'TX mar, debería feb' },
];

async function main() {
  console.log(`\n${'═'.repeat(100)}`);
  console.log(`  CORRECCIÓN FEBRERO 2026 — ${FIXES_FEB.length} folios`);
  console.log(`${'═'.repeat(100)}\n`);

  let fixed = 0, removed = 0, accepted = 0;

  for (const fix of FIXES_FEB) {
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
      console.log(`  ℹ️  Folio ${String(fix.folio).padStart(8)} | ${provName} | Sin match actual — nada que corregir`);
      continue;
    }

    const currentTxId = currentMatch.transaction?.id;
    const currentTxDate = currentMatch.transaction?.date?.toISOString()?.substring(0, 10) || 'N/A';
    const currentTxAmt = Math.abs(currentMatch.transaction?.amount || 0);

    // Verificar si el match actual es realmente malo
    const excelD = new Date(fix.excelDate);
    const txD = currentMatch.transaction?.date;
    const daysDiff = txD ? Math.abs(Math.round((txD - excelD) / (86400000))) : 999;
    const amtDiffPct = fix.excelAmount > 0 ? Math.abs(currentTxAmt - fix.excelAmount) / fix.excelAmount : 0;

    if (daysDiff <= 15 && amtDiffPct < 0.05) {
      console.log(`  ✅ Folio ${String(fix.folio).padStart(8)} | ${provName} | Match aceptable (${daysDiff}d, ${(amtDiffPct*100).toFixed(1)}% diff)`);
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

    // Filtrar disponibles
    const available = [];
    for (const c of candidates) {
      const hasMatch = await p.reconciliationMatch.findFirst({
        where: { transactionId: c.id, status: 'CONFIRMED' }
      });
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
          transactionId: best.id,
          dteId: dte.id,
          organizationId: dte.organizationId,
          status: 'CONFIRMED',
          confidence: 1.0,
          origin: 'MANUAL',
          notes: 'Fix: reasignación auditoría Feb',
          confirmedAt: new Date(),
        }
      });
      await p.bankTransaction.update({ where: { id: best.id }, data: { status: 'MATCHED' } });
      await p.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'PAID', outstandingAmount: 0 } });

      console.log(`  🔧 Folio ${String(fix.folio).padStart(8)} | ${provName} | ${currentTxDate} → ${best.date.toISOString().substring(0,10)} "${best.description?.substring(0,30)}" ✅`);
      fixed++;
    } else {
      await p.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'UNPAID', outstandingAmount: dte.totalAmount } });
      console.log(`  🗑️  Folio ${String(fix.folio).padStart(8)} | ${provName} | BORRADO match (${currentTxDate} $${currentTxAmt.toLocaleString()}) → UNPAID`);
      removed++;
    }
  }

  console.log(`\n${'─'.repeat(100)}`);
  console.log(`  RESULTADO FEB: 🔧 ${fixed} corregidos | 🗑️ ${removed} borrados → UNPAID | ✅ ${accepted} aceptados`);
  console.log(`${'─'.repeat(100)}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
