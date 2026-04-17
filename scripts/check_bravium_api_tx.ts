import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orgId = '715545b8-4522-4bb1-be81-3047546c0e8c';
  
  const apiTxs = await prisma.bankTransaction.findMany({
    where: { 
      bankAccount: { organizationId: orgId },
      origin: 'API_INTEGRATION'
    },
    take: 5
  });

  console.log('Sample API_INTEGRATION transactions for Bravium:');
  console.log(JSON.stringify(apiTxs, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
