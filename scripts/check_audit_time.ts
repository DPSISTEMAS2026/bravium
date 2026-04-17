import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.auditLog.findMany({
    where: { 
      createdAt: {
        gte: new Date('2026-04-11T20:15:00Z'),
        lte: new Date('2026-04-11T20:25:00Z')
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  console.log('Audit Logs around 2026-04-11 20:20:');
  console.log(JSON.stringify(logs, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
