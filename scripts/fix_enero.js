const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

// Problemas de Enero: matches incorrectos que debemos corregir
const FIXES = [
  // GRUPO A: TX de mes/fecha completamente incorrecta — borrar match, buscar tx correcta
  { folio: 7092,     excelDate: '2026-01-13', excelAmount: 12697515, action: 'SEARCH' },
  { folio: 1247588,  excelDate: '2026-01-13', excelAmount: 3456819,  action: 'SEARCH' },
  { folio: 1247589,  excelDate: '2026-01-13', excelAmount: 1728410,  action: 'SEARCH' },
  { folio: 35,       excelDate: '2026-01-22', excelAmount: 2474600,  action: 'SEARCH' },
  { folio: 5320,     excelDate: '2026-01-09', excelAmount: 2133349,  action: 'SEARCH' },
  { folio: 26784,    excelDate: '2026-01-13', excelAmount: 767994,   action: 'SEARCH' },
  { folio: 803,      excelDate: '2026-01-28', excelAmount: 216900,   action: 'SEARCH' },
  { folio: 819,      excelDate: '2026-01-28', excelAmount: 198900,   action: 'SEARCH' },
  { folio: 801,      excelDate: '2026-01-28', excelAmount: 189900,   action: 'SEARCH' },
  { folio: 804,      excelDate: '2026-01-28', excelAmount: 189900,   action: 'SEARCH' },
  { folio: 825,      excelDate: '2026-01-28', excelAmount: 189900,   action: 'SEARCH' },
  { folio: 6409,     excelDate: '2026-01-13', excelAmount: 519840,   action: 'SEARCH' },
  { folio: 6404,     excelDate: '2026-01-13', excelAmount: 63963,    action: 'SEARCH' },
  { folio: 26859,    excelDate: '2026-01-09', excelAmount: 154247,   action: 'SEARCH' },
  { folio: 10520,    excelDate: '2026-01-13', excelAmount: 84492,    action: 'SEARCH' },
  { folio: 52472825, excelDate: '2026-01-02', excelAmount: 89272,    action: 'SEARCH' },
  // GRUPO B: Monto diferente
  { folio: 1247438,  excelDate: '2026-01-13', excelAmount: 7286049,  action: 'SEARCH' },
  { folio: 11401,    excelDate: '2026-01-09', excelAmount: 7109611,  action: 'SEARCH' },
  { folio: 827,      excelDate: '2026-01-28', excelAmount: 388800,   action: 'SEARCH' },
  { folio: 687,      excelDate: '2026-01-26', excelAmount: 5000,     action: 'SEARCH' },
];

async function findBestTransaction(excelDate, excelAmount, currentTxId) {
  const ed = new Date(excelDate);
  
  // Estrategia 1: Buscar por monto exacto en rango amplio (±15 días)
  const from1 = new Date(ed); from1.setDate(from1.getDate() - 15);
  const to1 = new Date(ed); to1.setDate(to1.getDate() + 15);
  
  let candidates = await p.bankTransaction.findMany({
    where: {
      date: { gte: from1, lte: to1 },
      OR: [{ amount: excelAmount }, { amount: -excelAmount }]
    },
    select: { id: true, date: true, amount: true, description: true, status: true, bankAccountId: true },
  });

  // Estrategia 2: Buscar por monto con tolerancia 5% y fecha cercana
  if (candidates.length === 0) {
    const amtLow = Math.floor(excelAmount * 0.95);
    const amtHigh = Math.ceil(excelAmount * 1.05);
    candidates = await p.bankTransaction.findMany({
      where: {
        date: { gte: from1, lte: to1 },
        OR: [
          { amount: { gte: amtLow, lte: amtHigh } },
          { amount: { gte: -amtHigh, lte: -amtLow } }
        ]
      },
      select: { id: true, date: true, amount: true, description: true, status: true, bankAccountId: true },
    });
  }

  // Estrategia 3: Buscar pagos agrupados — buscar en la descripción la tx con "Transf" del mismo día
  if (candidates.length === 0) {
    const dayBefore = new Date(ed); dayBefore.setDate(dayBefore.getDate() - 3);
    const dayAfter = new Date(ed); dayAfter.setDate(dayAfter.getDate() + 3);
    candidates = await p.bankTransaction.findMany({
      where: {
        date: { gte: dayBefore, lte: dayAfter },
        type: 'DEBIT',
        status: { in: ['PENDING', 'PARTIALLY_MATCHED'] },
      },
      select: { id: true, date: true, amount: true, description: true, status: true, bankAccountId: true },
      orderBy: { amount: 'asc' },
      take: 20
    });
  }

  // Filtrar candidatos disponibles (no matcheados con otro DTE, excepto si es la tx actual)
  const available = [];
  for (const c of candidates) {
    if (c.id === currentTxId) continue; // Excluir la misma tx incorrecta
    const existingMatch = await p.reconciliationMatch.findFirst({
      where: { transactionId: c.id, status: 'CONFIRMED' }
    });
    if (!existingMatch || c.status === 'PARTIALLY_MATCHED') {
      available.push(c);
    }
  }

  // Ordenar por cercanía en fecha y monto
  available.sort((a, b) => {
    const aDiff = Math.abs(Math.abs(a.amount) - excelAmount);
    const bDiff = Math.abs(Math.abs(b.amount) - excelAmount);
    if (aDiff !== bDiff) return aDiff - bDiff;
    return Math.abs(a.date - ed) - Math.abs(b.date - ed);
  });

  return available[0] || null;
}

async function main() {
  console.log(`\n${'═'.repeat(110)}`);
  console.log(`  CORRECCIÓN ENERO 2026 — ${FIXES.length} folios`);
  console.log(`${'═'.repeat(110)}\n`);

  let fixed = 0, removed = 0, needsManual = 0;
  const manualList = [];

  for (const fix of FIXES) {
    const dte = await p.dTE.findFirst({
      where: { folio: fix.folio },
      include: {
        provider: { select: { name: true } },
        matches: {
          where: { status: 'CONFIRMED' },
          include: { transaction: { select: { id: true, date: true, amount: true, description: true, status: true } } }
        }
      }
    });

    if (!dte) { console.log(`  ❓ Folio ${fix.folio}: no encontrado`); continue; }

    const provName = (dte.provider?.name || '???').substring(0, 28).padEnd(28);
    const currentMatch = dte.matches[0];
    const currentTxId = currentMatch?.transaction?.id;
    const currentTxDate = currentMatch?.transaction?.date?.toISOString()?.substring(0, 10) || 'N/A';
    const currentTxAmt = currentMatch?.transaction?.amount || 0;

    // Buscar mejor transacción
    const best = await findBestTransaction(fix.excelDate, fix.excelAmount, currentTxId);

    if (best && Math.abs(Math.abs(best.amount) - fix.excelAmount) / fix.excelAmount < 0.10) {
      // SWAP: borrar match viejo, crear nuevo
      console.log(`  🔧 Folio ${String(fix.folio).padStart(8)} | ${provName} | OLD: ${currentTxDate} $${Math.abs(currentTxAmt).toLocaleString()} → NEW: ${best.date.toISOString().substring(0,10)} $${Math.abs(best.amount).toLocaleString()} "${best.description?.substring(0,30)}"`);
      
      // Borrar match incorrecto
      if (currentMatch) {
        await p.balanceAdjustment.updateMany({ where: { matchId: currentMatch.id }, data: { matchId: null } });
        await p.reconciliationMatch.delete({ where: { id: currentMatch.id } });
        
        if (currentTxId) {
          const otherMatches = await p.reconciliationMatch.count({ where: { transactionId: currentTxId, status: 'CONFIRMED' } });
          if (otherMatches === 0) {
            await p.bankTransaction.update({ where: { id: currentTxId }, data: { status: 'PENDING' } });
          }
        }
      }

      // Crear match correcto
      await p.reconciliationMatch.create({
        data: {
          transactionId: best.id,
          dteId: dte.id,
          organizationId: dte.organizationId,
          status: 'CONFIRMED',
          confidence: 1.0,
          origin: 'MANUAL',
          notes: 'Fix: reasignación desde auditoría Enero Excel',
          confirmedAt: new Date(),
        }
      });

      await p.bankTransaction.update({ where: { id: best.id }, data: { status: 'MATCHED' } });
      await p.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'PAID', outstandingAmount: 0 } });
      fixed++;

    } else {
      // No se encontró tx exacta — borrar el match incorrecto y dejar pendiente
      if (currentMatch) {
        const matchDateOk = currentMatch.transaction?.date;
        const isDateBad = matchDateOk ? (Math.abs(matchDateOk - new Date(fix.excelDate)) > 25 * 86400000) : false;
        const isAmtBad = Math.abs(Math.abs(currentTxAmt) - fix.excelAmount) / fix.excelAmount > 0.15;

        if (isDateBad || isAmtBad) {
          // Match claramente incorrecto — borrar para limpieza
          await p.balanceAdjustment.updateMany({ where: { matchId: currentMatch.id }, data: { matchId: null } });
          await p.reconciliationMatch.delete({ where: { id: currentMatch.id } });
          if (currentTxId) {
            const otherMatches = await p.reconciliationMatch.count({ where: { transactionId: currentTxId, status: 'CONFIRMED' } });
            if (otherMatches === 0) {
              await p.bankTransaction.update({ where: { id: currentTxId }, data: { status: 'PENDING' } });
            }
          }
          await p.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'UNPAID', outstandingAmount: dte.totalAmount } });
          console.log(`  🗑️  Folio ${String(fix.folio).padStart(8)} | ${provName} | BORRADO match incorrecto (${currentTxDate} $${Math.abs(currentTxAmt).toLocaleString()}) → DTE queda UNPAID`);
          removed++;
        } else {
          console.log(`  ℹ️  Folio ${String(fix.folio).padStart(8)} | ${provName} | Match actual ACEPTABLE (pago agrupado?) — sin cambio`);
        }
      }

      const bestInfo = best ? `Mejor candidato: ${best.date.toISOString().substring(0,10)} $${Math.abs(best.amount).toLocaleString()} "${best.description?.substring(0,30)}"` : 'Sin candidato';
      manualList.push({ folio: fix.folio, provider: provName.trim(), excelAmt: fix.excelAmount, bestInfo });
      needsManual++;
    }
  }

  console.log(`\n${'─'.repeat(110)}`);
  console.log(`  RESULTADO: 🔧 ${fixed} corregidos | 🗑️ ${removed} borrados (quedan UNPAID) | ℹ️ ${needsManual} revisión/aceptados`);
  console.log(`${'─'.repeat(110)}`);

  if (manualList.length > 0) {
    console.log(`\n  FOLIOS PARA REVISIÓN MANUAL (posibles pagos agrupados):`);
    manualList.forEach((m, i) => {
      console.log(`  ${i+1}. Folio ${m.folio} (${m.provider}) Excel=$${m.excelAmt.toLocaleString()} — ${m.bestInfo}`);
    });
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
