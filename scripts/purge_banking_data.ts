import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- INICIANDO PURGA CUIDADOSA DE LA BANCA ---');

  // Paso 1: Eliminar balances adjustments linkeados a reconciliaciones
  const deletedAdjustments = await prisma.balanceAdjustment.deleteMany({
    where: {
      matchId: { not: null }
    }
  });
  console.log(`- Balance Adjustments eliminados: ${deletedAdjustments.count}`);

  // Paso 2: Eliminar todos los Matchs de reconciliación
  const deletedMatches = await prisma.reconciliationMatch.deleteMany({});
  console.log(`- Reconciliation Matches eliminados: ${deletedMatches.count}`);

  // Paso 3: Reiniciar el estado de todos los DTEs (Facturas) a UNPAID para empezar limpios
  const updatedDtes = await prisma.dTE.updateMany({
    where: { paymentStatus: { in: ['PAID', 'PARTIAL', 'OVERPAID'] } }, // O omitir esto e ir por todos
    data: { paymentStatus: 'UNPAID', outstandingAmount: 0 } // Nota: Oustanding deberia ser totalAmount, lo ajustaremos despues
  });
  console.log(`- Facturas DTEs reseteadas a UNPAID: ${updatedDtes.count}`);

  // Ajustar OutstandingAmount a totalAmount
  await prisma.$executeRaw`UPDATE "dtes" SET "outstandingAmount" = "totalAmount"`;
  console.log(`- OutstandingAmount restaurado en las Facturas.`);

  // Paso 4: Eliminar transacciones bancarias
  const deletedTxs = await prisma.bankTransaction.deleteMany({});
  console.log(`- Movimientos Bancarios eliminados de TODAS las cuentas: ${deletedTxs.count}`);

  console.log('--- PURGA COMPLETADA EXITOSAMENTE ---');
}

main().finally(() => prisma.$disconnect());
