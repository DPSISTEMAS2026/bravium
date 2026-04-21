import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.bankTransaction.count();
  console.log(`Transacciones actuales en BD: ${count}`);
}
main().finally(() => prisma.$disconnect());
