import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const recentLogs = await prisma.syncLog.findMany({
    where: {
        startedAt: { gte: twelveHoursAgo }
    },
    orderBy: { startedAt: 'desc' }
  });
  console.log(JSON.stringify(recentLogs, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
