import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const braviumId = '715545b8-4522-4bb1-be81-3047546c0e8c';
  
  const accounts = await prisma.bankAccount.findMany({
    where: { 
      organizationId: braviumId
    }
  });

  console.log('Bank Accounts specifically for Bravium:');
  console.log(JSON.stringify(accounts, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
