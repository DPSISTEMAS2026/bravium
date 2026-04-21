import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.bankTransaction.findMany({
    where: { 
        amount: -12156337
    }
  });

  console.log(`Transactions with amount -12156337: ${txs.length}`);
  for(const tx of txs) {
      console.log(`ID: ${tx.id}, status: ${tx.status}, ref: ${tx.fintocId}`);
      
      const suggs = await prisma.matchSuggestion.findMany({
          where: { transactionIds: { array_contains: tx.id } }
      });
      console.log(`  - Suggestions for this tx: ${suggs.length}`);
  }
}

main().finally(() => prisma.$disconnect());
