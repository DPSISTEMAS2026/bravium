import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log('--- Matches created today ---');
  const matches = await prisma.reconciliationMatch.findMany({
    where: {
      createdAt: { gte: today }
    },
    include: {
        transaction: { select: { description: true, amount: true, date: true } },
        dte: { select: { folio: true, totalAmount: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(matches, null, 2));

  console.log('\n--- Sync logs today ---');
  const syncLogs = await prisma.syncLog.findMany({
    where: {
        startedAt: { gte: today }
    },
    orderBy: { startedAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(syncLogs, null, 2));

  console.log('\n--- Bank Transactions ingested today ---');
  const transactions = await prisma.bankTransaction.findMany({
    where: {
        createdAt: { gte: today }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(transactions, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
