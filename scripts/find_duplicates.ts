import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const accs = await prisma.bankAccount.findMany({
    where: {
      accountNumber: { in: ['FINTOC-API', '79828384'] }
    }
  });

  console.log('Results:');
  console.log(JSON.stringify(accs, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
