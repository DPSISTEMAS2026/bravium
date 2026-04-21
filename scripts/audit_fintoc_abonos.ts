import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.bankAccount.findMany();
  
  for (const acc of accounts) {
    const credits2026 = await prisma.bankTransaction.count({
      where: {
        bankAccountId: acc.id,
        type: 'CREDIT',
        date: { gte: new Date('2026-01-01T00:00:00.000Z') }
      }
    });

    const debits2026 = await prisma.bankTransaction.count({
      where: {
        bankAccountId: acc.id,
        type: 'DEBIT',
        date: { gte: new Date('2026-01-01T00:00:00.000Z') }
      }
    });

    if (credits2026 > 0 || debits2026 > 0) {
      console.log(`Cuenta: ${acc.bankName} (${acc.accountNumber}) | Abonos: ${credits2026} | Cargos: ${debits2026}`);
    }
  }

  console.log('\nAnalizando si Fintoc guardó abonos como Cargos (DEBIT y amounts positivos/negativos)...');
  
  const sampleFintoc = await prisma.bankTransaction.findMany({
    where: { bankAccount: { bankName: { contains: 'Fintoc' } } },
    take: 10
  });

  console.log('Sample de transacciones Fintoc:');
  sampleFintoc.forEach(tx => console.log(`[FINTOC] ID: ${tx.id} | Tipo: ${tx.type} | Amount: ${tx.amount} | Glosa: ${tx.description}`));

  const allTypes = await prisma.bankTransaction.groupBy({
    by: ['type'],
    _count: true,
    _sum: { amount: true },
    where: { date: { gte: new Date('2026-01-01T00:00:00.000Z') } }
  });
  console.log('\nResumen Global por Tipo 2026:', allTypes);

  // Podrían estar "escondidos" como DEBIT pero con Glosas como "Abono", "Transferencia", etc.
  const suspiciousDebits = await prisma.bankTransaction.findMany({
    where: {
      type: 'DEBIT',
      date: { gte: new Date('2026-01-01T00:00:00.000Z') },
      OR: [
        { description: { contains: 'ABONO', mode: 'insensitive' } },
        { description: { contains: 'TRANSF DE', mode: 'insensitive' } },
      ]
    },
    take: 5
  });

  console.log('\nCargos (DEBIT) sospechosos que parecen Abonos según su descripción:');
  suspiciousDebits.forEach(tx => console.log(`[SOSPECHOSO] Fecha: ${tx.date.toISOString().slice(0, 10)} | Monto: ${tx.amount} | Glosa: ${tx.description}`));

}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
