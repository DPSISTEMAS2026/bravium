import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.bankAccount.findMany({
    include: { organization: true }
  });

  console.log('Global Bank Accounts Status:');
  accounts.forEach(a => {
    console.log(`ID: ${a.id} | Name: ${a.bankName} | Acc: ${a.accountNumber} | Org: ${a.organization.name} (${a.organizationId})`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
