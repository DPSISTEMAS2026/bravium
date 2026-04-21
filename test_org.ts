import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const tx = await prisma.bankTransaction.findFirst({ where: { amount: -288960 } });
  console.log('tx:', tx);
  await prisma.$disconnect();
}
main();
