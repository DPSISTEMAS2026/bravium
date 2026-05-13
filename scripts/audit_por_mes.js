const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const months = [
    { label: 'Enero 2026', from: '2026-01-01', to: '2026-01-31' },
    { label: 'Febrero 2026', from: '2026-02-01', to: '2026-02-28' },
    { label: 'Marzo 2026', from: '2026-03-01', to: '2026-03-31' },
    { label: 'Abril 2026', from: '2026-04-01', to: '2026-04-30' },
  ];

  // Cuentas bancarias
  const accounts = await p.bankAccount.findMany({ select: { id: true, bankName: true } });
  const accName = (id) => accounts.find(a => a.id === id)?.bankName || id;

  for (const m of months) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  ${m.label.toUpperCase()}`);
    console.log(`${'═'.repeat(70)}`);

    // --- DTEs del mes ---
    const dtes = await p.dTE.findMany({
      where: { issuedDate: { gte: new Date(m.from), lte: new Date(m.to) } },
      include: {
        provider: { select: { name: true, rut: true } },
        matches: {
          where: { status: 'CONFIRMED' },
          include: { transaction: { select: { id: true, date: true, amount: true, description: true, bankAccountId: true } } }
        }
      },
      orderBy: { folio: 'asc' }
    });

    const dtesUnpaid = dtes.filter(d => d.paymentStatus !== 'PAID');
    const dtesPaid = dtes.filter(d => d.paymentStatus === 'PAID');
    const dtesMatched = dtes.filter(d => d.matches.length > 0);
    const dtesNoMatch = dtes.filter(d => d.matches.length === 0 && d.paymentStatus !== 'PAID');
    
    const totalDTE = dtes.reduce((s, d) => s + d.totalAmount, 0);
    const totalPaid = dtesPaid.reduce((s, d) => s + d.totalAmount, 0);

    console.log(`\n  📄 DTEs: ${dtes.length} | Pagados: ${dtesPaid.length} | Pendientes: ${dtesUnpaid.length} | Con match: ${dtesMatched.length}`);
    console.log(`     Total facturado: $${totalDTE.toLocaleString()} | Pagado: $${totalPaid.toLocaleString()}`);

    // Detalle de DTEs sin match
    if (dtesNoMatch.length > 0) {
      console.log(`\n  ⚠️  DTEs SIN MATCH (pendientes):`);
      dtesNoMatch.forEach(d => {
        console.log(`     Folio ${d.folio} | ${d.provider?.name?.substring(0,25)?.padEnd(25)} | $${d.totalAmount.toLocaleString().padStart(10)} | ${d.paymentStatus}`);
      });
    }

    // Detalle de matches - verificar coherencia de fechas
    const badMatches = [];
    dtesMatched.forEach(d => {
      d.matches.forEach(match => {
        if (match.transaction) {
          const dteDate = new Date(d.issuedDate);
          const txDate = new Date(match.transaction.date);
          const diffDays = Math.round((txDate - dteDate) / (1000*60*60*24));
          
          // Flag si la tx es de un mes muy diferente al DTE
          const dteMonth = dteDate.getMonth();
          const txMonth = txDate.getMonth();
          if (Math.abs(dteMonth - txMonth) > 1 || (txDate < dteDate && diffDays < -15)) {
            badMatches.push({
              folio: d.folio,
              provider: d.provider?.name,
              dteDate: d.issuedDate.toISOString().substring(0,10),
              txDate: match.transaction.date.toISOString().substring(0,10),
              txDesc: match.transaction.description?.substring(0,35),
              txAmount: match.transaction.amount,
              diffDays,
              matchId: match.id
            });
          }
        }
      });
    });

    if (badMatches.length > 0) {
      console.log(`\n  🔴 MATCHES SOSPECHOSOS (tx de mes diferente al DTE):`);
      badMatches.forEach(b => {
        console.log(`     Folio ${b.folio} (${b.dteDate}) ↔ Tx ${b.txDate} $${b.txAmount} "${b.txDesc}" [${b.diffDays}d diferencia]`);
      });
    }

    // --- Transacciones DEBIT del mes ---
    const txs = await p.bankTransaction.findMany({
      where: {
        date: { gte: new Date(m.from), lte: new Date(m.to) },
        type: 'DEBIT'
      },
      include: {
        matches: { where: { status: 'CONFIRMED' }, select: { id: true, dteId: true } }
      },
      orderBy: { date: 'asc' }
    });

    const txMatched = txs.filter(t => t.matches.length > 0);
    const txPending = txs.filter(t => t.status === 'PENDING' && t.matches.length === 0);
    const txReviewed = txs.filter(t => t.status === 'MATCHED' && t.matches.length === 0);
    const totalDebits = txs.reduce((s, t) => s + Math.abs(t.amount), 0);

    console.log(`\n  🏦 Movimientos DEBIT: ${txs.length} | Conciliados: ${txMatched.length} | Pendientes: ${txPending.length} | Revisados: ${txReviewed.length}`);
    console.log(`     Total cargos: $${totalDebits.toLocaleString()}`);

    // Transacciones DEBIT pendientes sin match (no revisadas)
    if (txPending.length > 0 && txPending.length <= 15) {
      console.log(`\n  📋 DEBIT sin conciliar (${txPending.length}):`);
      txPending.forEach(t => {
        console.log(`     ${t.date.toISOString().substring(0,10)} | $${Math.abs(t.amount).toLocaleString().padStart(10)} | ${t.description?.substring(0,45)} | ${accName(t.bankAccountId)}`);
      });
    } else if (txPending.length > 15) {
      console.log(`\n  📋 DEBIT sin conciliar: ${txPending.length} transacciones (mostrando top 10 por monto)`);
      txPending.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 10).forEach(t => {
        console.log(`     ${t.date.toISOString().substring(0,10)} | $${Math.abs(t.amount).toLocaleString().padStart(10)} | ${t.description?.substring(0,45)} | ${accName(t.bankAccountId)}`);
      });
    }

    // --- Resumen de cobertura ---
    const coverageRate = dtes.length > 0 ? ((dtesMatched.length / dtes.length) * 100).toFixed(1) : 'N/A';
    const txCoverage = txs.length > 0 ? (((txMatched.length + txReviewed.length) / txs.length) * 100).toFixed(1) : 'N/A';
    console.log(`\n  📊 Cobertura DTEs: ${coverageRate}% | Cobertura Movimientos: ${txCoverage}%`);
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
