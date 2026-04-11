import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rejectedDtes = await prisma.dTE.count({
    where: { siiStatus: { contains: 'RECHAZADO', mode: 'insensitive' } }
  });
  console.log(`DTEs Rechazados en total: ${rejectedDtes}`);

  const recentRejected = await prisma.dTE.findMany({
    where: { siiStatus: { contains: 'RECHAZADO', mode: 'insensitive' } },
    orderBy: { issuedDate: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(recentRejected, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
