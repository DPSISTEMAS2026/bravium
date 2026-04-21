import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const credits = await prisma.bankTransaction.groupBy({
    by: ['status'],
    _count: true,
    where: { type: 'CREDIT', date: { gte: new Date('2026-01-01T00:00:00.000Z') } }
  });
  console.log("Estados de los 73 Abonos en 2026:");
  console.log(credits);

  const creditsByOrigin = await prisma.bankTransaction.groupBy({
    by: ['origin'],
    _count: true,
    where: { type: 'CREDIT', date: { gte: new Date('2026-01-01T00:00:00.000Z') } }
  });
  console.log("\nOrigenes de los 73 Abonos en 2026:");
  console.log(creditsByOrigin);
}

main().finally(() => prisma.$disconnect());
