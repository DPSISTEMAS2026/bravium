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

  const transactions = await prisma.bankTransaction.findMany({
    where: { 
      bankAccount: {
        organizationId: org.id 
      }
    },
    include: {
      bankAccount: true
    },
    orderBy: { date: 'desc' },
    take: 10
  });

  console.log(`Found ${transactions.length} transactions:`);
  transactions.forEach(tx => {
    console.log(`- ID: ${tx.id}`);
    console.log(`  Date: ${tx.date.toISOString()}`);
    console.log(`  Amount: ${tx.amount}`);
    console.log(`  Description: ${tx.description}`);
    console.log(`  Type: ${tx.type}`);
    console.log(`  Status: ${tx.status}`);
    console.log(`  Account: ${tx.bankAccount.bankName} (${tx.bankAccount.accountNumber})`);
    console.log('---');
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
