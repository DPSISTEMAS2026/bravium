import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Restaurando outstandingAmount a totalAmount para TODOS los DTE (históricos)...');
  
  const result = await prisma.$executeRaw`UPDATE "dtes" SET "outstandingAmount" = "totalAmount", "paymentStatus" = 'UNPAID'`;
  
  console.log('Facturas reiniciadas por completo en toda la base de datos.');

  const check = await prisma.dTE.count({ where: { outstandingAmount: { lte: 0 } } });
  console.log(`DTEs que quedaron con outstandingAmount = 0 (deberían ser ceros si la data venía neta en totalAmount): ${check}`);

  // Refrescar saldos de proveedores
  console.log('Recalculando el saldo de todos los proveedores (suma de outstandingAmounts de sus DTEs)...');
  
  const providers = await prisma.provider.findMany();
  for (const p of providers) {
    const dtes = await prisma.dTE.aggregate({
      where: { providerId: p.id, paymentStatus: 'UNPAID' },
      _sum: { outstandingAmount: true }
    });
    const totalDeuda = dtes._sum.outstandingAmount || 0;
    
    await prisma.provider.update({
      where: { id: p.id },
      data: { currentBalance: totalDeuda }
    });
  }
  
  console.log('Balances de proveedores han sido refrescados.');
}

main().finally(() => prisma.$disconnect());
