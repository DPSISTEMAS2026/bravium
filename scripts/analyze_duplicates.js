const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Contar transacciones por cuenta
  const accounts = await p.bankAccount.findMany({ select: { id: true, bankName: true, accountNumber: true } });
  for (const acc of accounts) {
    const count = await p.bankTransaction.count({ where: { bankAccountId: acc.id } });
    if (count > 0) console.log(acc.bankName, '(' + acc.accountNumber + ')', '→', count, 'txs');
  }

  // Buscar duplicados actuales
  const allTxs = await p.bankTransaction.findMany({
    select: { id: true, date: true, amount: true, description: true, bankAccountId: true, reference: true, status: true },
    orderBy: { date: 'desc' }
  });

  // Duplicados dentro de la MISMA cuenta
  const sameAccGroups = {};
  allTxs.forEach(tx => {
    const key = tx.date.toISOString() + '|' + tx.amount + '|' + tx.description + '|' + tx.bankAccountId;
    if (!sameAccGroups[key]) sameAccGroups[key] = [];
    sameAccGroups[key].push(tx);
  });

  const sameAccDups = Object.entries(sameAccGroups).filter(([, v]) => v.length > 1);
  let sameAccExtra = 0;
  sameAccDups.forEach(([, txs]) => sameAccExtra += txs.length - 1);

  // Duplicados CROSS-ACCOUNT (misma fecha + monto + descripción, diferente cuenta)
  const crossGroups = {};
  allTxs.forEach(tx => {
    const key = tx.date.toISOString() + '|' + tx.amount + '|' + tx.description;
    if (!crossGroups[key]) crossGroups[key] = [];
    crossGroups[key].push(tx);
  });

  const crossDups = Object.entries(crossGroups).filter(([, v]) => {
    if (v.length <= 1) return false;
    const accs = new Set(v.map(t => t.bankAccountId));
    return accs.size > 1; // Están en cuentas diferentes
  });

  let crossExtra = 0;
  crossDups.forEach(([, txs]) => crossExtra += txs.length - 1);

  console.log('\n=== RESULTADOS ===');
  console.log('Total transacciones en BD:', allTxs.length);
  console.log('Duplicados MISMA cuenta (fecha+monto+desc+cuenta):', sameAccDups.length, 'grupos,', sameAccExtra, 'extras');
  console.log('Duplicados CROSS-ACCOUNT (fecha+monto+desc, != cuenta):', crossDups.length, 'grupos,', crossExtra, 'extras');

  // Ejemplos de duplicados cross-account
  console.log('\n--- Ejemplos duplicados cross-account ---');
  crossDups.slice(0, 5).forEach(([key, txs]) => {
    const [date, amount, desc] = key.split('|');
    console.log('  ' + date.split('T')[0] + ' $' + amount + ' ' + desc.substring(0, 40));
    txs.forEach(t => {
      const accName = accounts.find(a => a.id === t.bankAccountId)?.bankName || t.bankAccountId;
      console.log('    → [' + t.status + '] ' + accName + ' ref:' + (t.reference || 'null'));
    });
  });

  // Ejemplos de duplicados misma cuenta
  console.log('\n--- Ejemplos duplicados misma cuenta ---');
  sameAccDups.slice(0, 5).forEach(([key, txs]) => {
    const [date, amount, desc] = key.split('|');
    console.log('  ' + date.split('T')[0] + ' $' + amount + ' ' + desc.substring(0, 40));
    txs.forEach(t => {
      console.log('    → [' + t.status + '] ref:' + (t.reference || 'null') + ' id:' + t.id.substring(0, 8));
    });
  });

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
