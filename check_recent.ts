import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Ongoing/Recent Sync Jobs ---');
  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(logs, null, 2));

  console.log('\n--- Recent Matches ---');
  const matches = await prisma.reconciliationMatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      transaction: { select: { description: true, amount: true } },
      dte: { select: { folio: true } }
    }
  });
  console.log(JSON.stringify(matches, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
