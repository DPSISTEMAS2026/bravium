import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Resumen base de datos: Enero 2026 ---');
  console.log('Filtro de fecha: 2025-12-30 hasta 2026-01-31\n');

  const startDate = new Date('2025-12-30T00:00:00.000Z');
  const endDate = new Date('2026-01-31T23:59:59.999Z');

  const accounts = await prisma.bankAccount.findMany();

  for (const acc of accounts) {
    const txs = await prisma.bankTransaction.findMany({
      where: {
        bankAccountId: acc.id,
        date: { gte: startDate, lte: endDate }
      }
    });

    let credit = 0;
    let debit = 0;
    
    // Contadores por origin
    const countByOrigin: Record<string, number> = {};

    txs.forEach(tx => {
      if (tx.type === 'CREDIT') credit++;
      else debit++;
      
      const origin = tx.origin || 'DESCONOCIDO';
      countByOrigin[origin] = (countByOrigin[origin] || 0) + 1;
    });

    if (txs.length > 0 || acc.bankName.includes('Scotiabank') || acc.bankName.includes('Itaú')) {
        console.log(`**Cuenta: ${acc.bankName} (${acc.accountNumber})**`);
        console.log(`  - Cargos (DEBIT): ${debit}`);
        console.log(`  - Abonos (CREDIT): ${credit}`);
        console.log(`  - Detalle orígenes:`, countByOrigin);
        console.log('----------------------------------------------------');
    }
  }
}

main().finally(() => prisma.$disconnect());
