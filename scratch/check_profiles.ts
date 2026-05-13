import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all organizations with Fintoc config
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, slug: true, fintocApiKey: true, fintocLinkToken: true }
  });
  console.log('=== ORGANIZATIONS ===');
  console.log(JSON.stringify(orgs, null, 2));

  // Get all users
  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, email: true, role: true, organizationId: true }
  });
  console.log('\n=== USERS ===');
  console.log(JSON.stringify(users, null, 2));

  // Get last sync logs
  const syncLogs = await prisma.syncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 20,
    select: { id: true, type: true, status: true, organizationId: true, startedAt: true, finishedAt: true, message: true, totalFound: true, created: true, errors: true }
  });
  console.log('\n=== LATEST SYNC LOGS ===');
  console.log(JSON.stringify(syncLogs, null, 2));

  // Get latest bank transactions per account
  const bankAccounts = await prisma.bankAccount.findMany({
    select: {
      id: true, bankName: true, accountNumber: true, rutHolder: true, isActive: true, organizationId: true,
      transactions: {
        orderBy: { date: 'desc' },
        take: 1,
        select: { id: true, date: true, description: true, amount: true }
      }
    }
  });
  console.log('\n=== BANK ACCOUNTS (with last transaction) ===');
  console.log(JSON.stringify(bankAccounts, null, 2));

  await prisma.$disconnect();
}

main();
