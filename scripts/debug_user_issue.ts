import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  // 1. DTE 5549267
  const dte = await prisma.dTE.findFirst({
    where: { folio: 5549267 },
    include: { matches: { include: { transaction: true } } }
  });
  console.log('--- DTE 5549267 ---');
  if (dte) {
    console.log(`Folio: ${dte.folio}, Status: ${dte.paymentStatus}, Amount: ${dte.totalAmount}`);
    if (dte.matches.length > 0) {
      dte.matches.forEach(m => {
        console.log(`  Match ID: ${m.id}, Status: ${m.status}, Tx: ${m.transaction?.description} ($${m.transaction?.amount})`);
      });
    } else {
      console.log('  No matches found.');
    }
  } else {
    console.log('DTE not found.');
  }

  // 2. Transactions with amount ~1.003.980
  const txs = await prisma.bankTransaction.findMany({
    where: { 
      OR: [
        { amount: { gte: 1003000, lte: 1005000 } },
        { amount: { gte: -1005000, lte: -1003000 } }
      ]
    },
    include: { matches: true }
  });
  console.log('\n--- Transactions ~1.003.980 ---');
  if (txs.length > 0) {
    txs.forEach(t => {
      console.log(`ID: ${t.id}, Date: ${t.date.toISOString()}, Desc: ${t.description}, Amount: ${t.amount}, Status: ${t.status}, Matches: ${t.matches.length}`);
    });
  } else {
    console.log('No similar transactions found.');
  }

  await prisma.$disconnect();
}

main();
