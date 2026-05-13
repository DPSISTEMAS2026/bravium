const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const DRIVE_ACCOUNT_ID = 'aee84d25-1364-4e5c-a6e7-9138c6ae1a9f';

async function main() {
  // 1. Contar transacciones Drive Import
  const count = await p.bankTransaction.count({ where: { bankAccountId: DRIVE_ACCOUNT_ID } });
  console.log(`Drive Import transacciones a eliminar: ${count}`);

  // 2. Eliminar matches asociados
  const txIds = await p.bankTransaction.findMany({
    where: { bankAccountId: DRIVE_ACCOUNT_ID },
    select: { id: true }
  });
  const ids = txIds.map(t => t.id);

  // Eliminar adjustments de matches
  const matchesOfDrive = await p.reconciliationMatch.findMany({
    where: { transactionId: { in: ids } },
    select: { id: true }
  });
  const matchIds = matchesOfDrive.map(m => m.id);
  
  if (matchIds.length > 0) {
    const adjDel = await p.balanceAdjustment.deleteMany({ where: { matchId: { in: matchIds } } });
    console.log(`Adjustments eliminados: ${adjDel.count}`);
    
    const matchDel = await p.reconciliationMatch.deleteMany({ where: { id: { in: matchIds } } });
    console.log(`Matches eliminados: ${matchDel.count}`);
  }

  // Eliminar paymentRecords asociados
  const prDel = await p.paymentRecord.deleteMany({ where: { transactionId: { in: ids } } });
  if (prDel.count > 0) console.log(`PaymentRecords eliminados: ${prDel.count}`);

  // 3. Eliminar transacciones
  const txDel = await p.bankTransaction.deleteMany({ where: { bankAccountId: DRIVE_ACCOUNT_ID } });
  console.log(`Transacciones eliminadas: ${txDel.count}`);

  // 4. Desactivar la cuenta bancaria Drive Import
  await p.bankAccount.update({
    where: { id: DRIVE_ACCOUNT_ID },
    data: { isActive: false }
  });
  console.log(`\n✅ Cuenta "Drive Import" desactivada`);

  // Verificar conteo final
  const total = await p.bankTransaction.count();
  console.log(`\nTotal transacciones restantes: ${total}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
