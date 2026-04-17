import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const transactions = await prisma.bankTransaction.findMany({
    where: { 
      bankAccount: {
        organization: { name: { contains: 'Dp sistemas', mode: 'insensitive' } }
      }
    },
    take: 2
  });

  console.log(JSON.stringify(transactions, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
