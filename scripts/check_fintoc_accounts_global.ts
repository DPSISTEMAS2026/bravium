import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.bankAccount.findMany({
    where: { 
      OR: [
        { bankName: { contains: 'Fintoc', mode: 'insensitive' } },
        { accountNumber: { contains: 'FINTOC', mode: 'insensitive' } }
      ]
    }
  });

  console.log('Fintoc-related BankAccounts in the entire system:');
  console.log(JSON.stringify(accounts, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
