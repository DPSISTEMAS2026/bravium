import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Ultimos 5 Registros de Auditoría ---');
  const audits = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(audits, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
