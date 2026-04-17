import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const syncs = await prisma.syncLog.findMany({
    where: { 
      organizationId: '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d'
    },
    orderBy: { startedAt: 'desc' },
    take: 10
  });

  console.log('Sync Logs for DP Sistemas:');
  console.log(JSON.stringify(syncs, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
