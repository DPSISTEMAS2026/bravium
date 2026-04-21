import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.bankTransaction.findMany();
  
  const map = new Map();
  let duplicatesCount = 0;
  for (const t of txs) {
      if (!t.metadata) continue;
      const fId = (t.metadata as any).fintocId;
      if (!fId) continue;
      if (map.has(fId)) {
          duplicatesCount++;
          await prisma.reconciliationMatch.deleteMany({where: {transactionId: t.id}});
          await prisma.bankTransaction.delete({where: {id: t.id}});
      } else {
          map.set(fId, t.id);
      }
  }
  console.log(`Duplicates deleted: ${duplicatesCount}`);
}

main().finally(() => prisma.$disconnect());
