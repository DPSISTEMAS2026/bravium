const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log(`\n${'═'.repeat(110)}`);
  console.log(`  OPTIMIZACIÓN: Reasignar matches por proximidad de fecha`);
  console.log(`  Regla: cada DTE debe tener el movimiento bancario más cercano a su fecha`);
  console.log(`${'═'.repeat(110)}\n`);

  // Buscar proveedores con múltiples DTEs matcheados del mismo monto
  const matchedDtes = await p.dTE.findMany({
    where: {
      issuedDate: { gte: new Date('2026-01-01') },
      matches: { some: { status: 'CONFIRMED' } }
    },
    include: {
      provider: { select: { id: true, name: true } },
      matches: {
        where: { status: 'CONFIRMED' },
        include: { transaction: { select: { id: true, date: true, amount: true, description: true } } }
      }
    },
    orderBy: { issuedDate: 'asc' }
  });

  // Agrupar por (providerId, monto absoluto)
  const groups = {};
  for (const dte of matchedDtes) {
    if (!dte.provider || dte.matches.length === 0) continue;
    const key = `${dte.provider.id}__${Math.abs(dte.totalAmount)}`;
    if (!groups[key]) groups[key] = { provider: dte.provider.name, amount: dte.totalAmount, dtes: [] };
    groups[key].dtes.push(dte);
  }

  // Filtrar solo grupos con 2+ DTEs (donde puede haber cruces)
  const multiGroups = Object.values(groups).filter(g => g.dtes.length >= 2);
  
  console.log(`  Encontrados ${multiGroups.length} grupos de proveedor+monto con 2+ DTEs\n`);

  let totalSwaps = 0, totalGroups = 0;

  for (const group of multiGroups) {
    const dtes = group.dtes.sort((a, b) => a.issuedDate - b.issuedDate);
    
    // Recopilar todos los matches actuales
    const currentPairs = dtes.map(d => ({
      dteId: d.id,
      folio: d.folio,
      dteDate: d.issuedDate,
      matchId: d.matches[0].id,
      txId: d.matches[0].transaction.id,
      txDate: d.matches[0].transaction.date,
      txDesc: d.matches[0].transaction.description,
    }));

    // Verificar si ya están en orden óptimo
    // Para cada DTE, su tx debería ser la más cercana disponible
    const txPool = currentPairs.map(p => ({ txId: p.txId, txDate: p.txDate, txDesc: p.txDesc }));
    
    // Asignar óptimamente: ordenar DTEs por fecha, asignar tx más cercana disponible
    const dteSorted = [...currentPairs].sort((a, b) => a.dteDate - b.dteDate);
    const txAvailable = [...txPool].sort((a, b) => a.txDate - b.txDate);
    
    // Greedy assignment: para cada DTE (en orden), tomar la tx más cercana que quede
    const optimalAssignment = [];
    const usedTxs = new Set();
    
    for (const dte of dteSorted) {
      let bestIdx = -1;
      let bestDiff = Infinity;
      
      for (let i = 0; i < txAvailable.length; i++) {
        if (usedTxs.has(i)) continue;
        const diff = Math.abs(txAvailable[i].txDate - dte.dteDate);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      
      if (bestIdx >= 0) {
        usedTxs.add(bestIdx);
        optimalAssignment.push({
          dteId: dte.dteId,
          folio: dte.folio,
          dteDate: dte.dteDate,
          matchId: dte.matchId,
          currentTxId: dte.txId,
          optimalTxId: txAvailable[bestIdx].txId,
          optimalTxDate: txAvailable[bestIdx].txDate,
          currentTxDate: dte.txDate,
          needsSwap: dte.txId !== txAvailable[bestIdx].txId
        });
      }
    }

    const swapsNeeded = optimalAssignment.filter(a => a.needsSwap);
    if (swapsNeeded.length === 0) continue; // Ya óptimo

    totalGroups++;
    const provName = group.provider.substring(0, 30);
    console.log(`  📦 ${provName} | $${group.amount.toLocaleString()} | ${dtes.length} DTEs | ${swapsNeeded.length} swaps necesarios`);

    // Mostrar el antes/después
    for (const a of optimalAssignment) {
      const dteD = a.dteDate.toISOString().substring(0, 10);
      const curD = a.currentTxDate.toISOString().substring(0, 10);
      const optD = a.optimalTxDate.toISOString().substring(0, 10);
      if (a.needsSwap) {
        console.log(`     Folio ${String(a.folio).padStart(8)} (${dteD}): ${curD} → ${optD}`);
      }
    }

    // Ejecutar los swaps: actualizar transactionId en cada match
    for (const a of optimalAssignment) {
      if (!a.needsSwap) continue;
      
      // Buscar el match de este DTE
      const match = await p.reconciliationMatch.findFirst({
        where: { dteId: a.dteId, status: 'CONFIRMED' }
      });
      
      if (match) {
        await p.reconciliationMatch.update({
          where: { id: match.id },
          data: { 
            transactionId: a.optimalTxId,
            notes: `Swap: reasignado por proximidad de fecha (${a.currentTxDate.toISOString().substring(0,10)} → ${a.optimalTxDate.toISOString().substring(0,10)})`
          }
        });
        totalSwaps++;
      }
    }
    console.log(`     ✅ ${swapsNeeded.length} swaps aplicados\n`);
  }

  console.log(`${'─'.repeat(110)}`);
  console.log(`  RESULTADO: ${totalGroups} grupos con swaps | ${totalSwaps} reasignaciones totales`);
  console.log(`${'─'.repeat(110)}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
