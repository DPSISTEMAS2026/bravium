import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d'; // DP Sistemas
  const newToken = 'link_J0WLYbi44b8YXxAB_token_UkPBkogv_yjoEW9XLY66gzn-';

  console.log(`Updating Fintoc Link Token for DP Sistemas...`);
  
  await prisma.organization.update({
    where: { id: orgId },
    data: { fintocLinkToken: newToken }
  });

  console.log('Token updated successfully.');

  // Delete mock transactions
  console.log('Cleaning up mock transactions...');
  const deleted = await prisma.bankTransaction.deleteMany({
    where: {
      bankAccount: { organizationId: orgId },
      metadata: {
        path: ['source'],
        equals: 'FINTOC_API'
      }
    }
  });

  console.log(`Deleted ${deleted.count} mock transactions.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
