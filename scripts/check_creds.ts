import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst({
    where: { name: { contains: 'Dp sistemas', mode: 'insensitive' } }
  });

  if (!org) {
    console.log('Organization not found');
    return;
  }

  console.log('Organization found:', org.id, org.name);
  console.log('Fintoc API Key:', org.fintocApiKey ? `${org.fintocApiKey.substring(0, 7)}...` : 'None');
  console.log('Fintoc Link Token:', org.fintocLinkToken || 'None');
  
  const bankAccounts = await prisma.bankAccount.findMany({
    where: { organizationId: org.id }
  });
  
  console.log('Bank Accounts:');
  console.log(JSON.stringify(bankAccounts, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
