import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Auditoría de Movimientos Santander ---');

  // Buscar todas las cuentas del banco Santander
  const accounts = await prisma.bankAccount.findMany({
    where: {
      bankName: {
        contains: 'Santander',
        mode: 'insensitive' // Por si dice "SANTANDER"
      }
    }
  });

  if (accounts.length === 0) {
    console.log('No se encontraron cuentas Santander en la base de datos.');
    return;
  }

  console.log('Cuentas Santander Encontradas:');
  for (const acc of accounts) {
    console.log(`- ID: ${acc.id} | Número: ${acc.accountNumber} | Entidad: ${acc.bankName}`);
  }

  console.log('\n--- Movimientos por Mes y por Cuenta ---');

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      bankAccountId: {
        in: accounts.map((a) => a.id)
      }
    },
    select: {
      date: true,
      bankAccountId: true
    }
  });

  // Agrupar por: AccountId -> Month -> Count
  const stats: Record<string, Record<string, number>> = {};

  accounts.forEach(acc => {
    stats[acc.id] = {};
  });

  transactions.forEach(tx => {
    const month = tx.date.toISOString().slice(0, 7); // YYYY-MM
    if (!stats[tx.bankAccountId][month]) {
      stats[tx.bankAccountId][month] = 0;
    }
    stats[tx.bankAccountId][month]++;
  });

  // Imprimir reporte
  accounts.forEach(acc => {
    console.log(`\n**Cuenta: ${acc.accountNumber} (${acc.bankName})**`);
    
    const accountStats = stats[acc.id];
    const months = Object.keys(accountStats).sort();
    
    if (months.length === 0) {
      console.log('  No hay movimientos registrados para esta cuenta.');
    } else {
      let total = 0;
      months.forEach(month => {
        console.log(`  - Mes ${month}: ${accountStats[month]} movimientos`);
        total += accountStats[month];
      });
      console.log(`  -> TOTAL GLOBAL CUENTA: ${total} movimientos`);
    }
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
