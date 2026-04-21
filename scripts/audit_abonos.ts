import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Auditoría de Abonos (CREDIT) vs Cargos (DEBIT) 2026 ---');

  // Traer Santander accounts
  const accounts = await prisma.bankAccount.findMany({
    where: { bankName: { contains: 'Santander', mode: 'insensitive' } }
  });

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      bankAccountId: { in: accounts.map(a => a.id) },
      date: { gte: new Date('2026-01-01T00:00:00.000Z') }
    },
    select: {
      id: true,
      bankAccountId: true,
      date: true,
      type: true,
      amount: true,
      description: true
    }
  });

  const stats: Record<string, { credit: number, debit: number, totalAmountCredit: number, credits: any[] }> = {};

  accounts.forEach(acc => {
    stats[acc.id] = { credit: 0, debit: 0, totalAmountCredit: 0, credits: [] };
  });

  transactions.forEach(tx => {
    const isCredit = tx.type === 'CREDIT' || tx.amount > 0;
    
    // Si amount > 0 y type es DEBIT, es un error de ingestión
    if (isCredit && tx.type === 'DEBIT') {
       // Console log error silencioso, o lo tomamos como credit
    }

    if (tx.type === 'CREDIT') {
      stats[tx.bankAccountId].credit++;
      stats[tx.bankAccountId].totalAmountCredit += tx.amount;
      stats[tx.bankAccountId].credits.push(tx);
    } else {
      stats[tx.bankAccountId].debit++;
    }
  });

  accounts.forEach(acc => {
    const s = stats[acc.id];
    console.log(`\n**Cuenta: ${acc.accountNumber} (${acc.bankName})**`);
    console.log(`  - Cargos (DEBIT): ${s.debit}`);
    console.log(`  - Abonos (CREDIT): ${s.credit} (Monto Total Abonos: $${s.totalAmountCredit.toLocaleString()})`);
    
    if (s.credit > 0) {
      console.log(`    Listado de Abonos (hasta 5):`);
      s.credits.slice(0, 5).forEach(c => {
         console.log(`      -> ${c.date.toISOString().slice(0, 10)} | ${c.description} | $${c.amount}`);
      });
    }
  });

  // What about ALL credits across all accounts in 2026?
  const allCreditsCount = await prisma.bankTransaction.count({
    where: {
      type: 'CREDIT',
      date: { gte: new Date('2026-01-01T00:00:00.000Z') }
    }
  });

  console.log(`\n--- NOTA: El sistema tiene un total general de ${allCreditsCount} Abonos (CREDIT) en cualquier cuenta de banco en 2026. ---`);
  
  // Vamos a revisar si hay amounts > 0 clasificados como DEBIT por error
  const positiveDebits = await prisma.bankTransaction.findMany({
    where: {
      type: 'DEBIT',
      amount: { gt: 0 },
      date: { gte: new Date('2026-01-01T00:00:00.000Z') }
    },
    take: 5
  });

  if (positiveDebits.length > 0) {
    console.log(`\n⚠️ ¡CUIDADO! Se detectaron transacciones con amount > 0 clasificadas como DEBIT en base de datos. Cantidad de ejemplo: ${positiveDebits.length}`);
    positiveDebits.forEach(pd => {
      console.log(`  - ID: ${pd.id} | Fecha: ${pd.date.toISOString().slice(0, 10)} | Monto: $${pd.amount} | Tipo: ${pd.type}`);
    });
  }

}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
