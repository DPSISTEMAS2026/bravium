import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== PASO 1: Verificar cuentas bancarias ===');
  
  const accounts = await prisma.bankAccount.findMany({
    include: { _count: { select: { transactions: true } } }
  });

  accounts.forEach(a => {
    console.log(`  ID: ${a.id} | ${a.bankName} (${a.accountNumber}) | Txs: ${a._count.transactions}`);
  });

  // Buscar la cuenta antigua de Santander CC y la nueva de Fintoc
  const oldCC = accounts.find(a => a.accountNumber === '0-000-9219882-0');
  const fintocCC = accounts.find(a => a.accountNumber === '92198820');

  if (oldCC && fintocCC) {
    console.log(`\n=== PASO 2: Migrar transacciones de Fintoc a cuenta Santander CC original ===`);
    console.log(`  De: ${fintocCC.bankName} (${fintocCC.id}) -> A: ${oldCC.bankName} (${oldCC.id})`);

    // Reasignar todas las transacciones de la cuenta Fintoc a la cuenta CC original
    const updated = await prisma.bankTransaction.updateMany({
      where: { bankAccountId: fintocCC.id },
      data: { bankAccountId: oldCC.id }
    });

    console.log(`  -> ${updated.count} transacciones reasignadas a ${oldCC.bankName}`);

    // Renombrar la cuenta antigua para reflejar que ahora recibe datos de Fintoc
    await prisma.bankAccount.update({
      where: { id: oldCC.id },
      data: { bankName: 'Santander CC (Fintoc)' }
    });

    // Eliminar la cuenta duplicada de Fintoc (ya vacía)
    await prisma.bankAccount.delete({ where: { id: fintocCC.id } });
    console.log(`  -> Cuenta duplicada eliminada. Todo unificado.`);
  } else {
    console.log('No se encontró el par de cuentas para unificar.');
    if (!oldCC) console.log('  -> Falta cuenta CC original (0-000-9219882-0)');
    if (!fintocCC) console.log('  -> Falta cuenta Fintoc (92198820)');
  }

  console.log('\n=== PASO 3: Verificar estado de conciliación ===');

  const matchCount = await prisma.reconciliationMatch.count();
  console.log(`  Matches en BD: ${matchCount}`);

  const suggestionCount = await prisma.matchSuggestion.count();
  console.log(`  Sugerencias en BD: ${suggestionCount}`);

  // Limpiar sugerencias viejas
  if (suggestionCount > 0) {
    const deletedSuggestions = await prisma.matchSuggestion.deleteMany({});
    console.log(`  -> Sugerencias eliminadas: ${deletedSuggestions.count}`);
  }

  // Limpiar PaymentRecords si existen
  const paymentRecordCount = await prisma.paymentRecord.count();
  if (paymentRecordCount > 0) {
    const deletedPR = await prisma.paymentRecord.deleteMany({});
    console.log(`  -> Payment Records eliminados: ${deletedPR.count}`);
  }

  // Verificar que TODOS los DTEs de 2026 estén en UNPAID
  const paidDtes2026 = await prisma.dTE.count({
    where: {
      issuedDate: { gte: new Date('2026-01-01T00:00:00Z') },
      paymentStatus: { not: 'UNPAID' }
    }
  });

  if (paidDtes2026 > 0) {
    console.log(`  ⚠️ Hay ${paidDtes2026} DTEs de 2026 que NO están en UNPAID. Reseteando...`);
    await prisma.dTE.updateMany({
      where: {
        issuedDate: { gte: new Date('2026-01-01T00:00:00Z') },
        paymentStatus: { not: 'UNPAID' }
      },
      data: { paymentStatus: 'UNPAID' }
    });
    // Restaurar outstandingAmount = totalAmount
    await prisma.$executeRaw`UPDATE "dtes" SET "outstandingAmount" = "totalAmount" WHERE "issuedDate" >= '2026-01-01'`;
    console.log(`  -> DTEs 2026 reseteados a UNPAID.`);
  } else {
    console.log(`  ✅ Todos los DTEs de 2026 ya están en UNPAID.`);
  }

  // Resumen final
  console.log('\n=== RESUMEN FINAL ===');
  const finalAccounts = await prisma.bankAccount.findMany({
    include: { _count: { select: { transactions: true } } }
  });
  finalAccounts.forEach(a => {
    console.log(`  ${a.bankName} (${a.accountNumber}) | Txs: ${a._count.transactions}`);
  });

  const totalDtes = await prisma.dTE.count({ where: { issuedDate: { gte: new Date('2026-01-01') } } });
  const unpaidDtes = await prisma.dTE.count({ where: { issuedDate: { gte: new Date('2026-01-01') }, paymentStatus: 'UNPAID' } });
  console.log(`  DTEs 2026: ${totalDtes} total | ${unpaidDtes} UNPAID`);
  console.log(`  Matches: ${await prisma.reconciliationMatch.count()}`);
  console.log('\n✅ Limpieza completa. Sistema listo para recibir datos frescos.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
