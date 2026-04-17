import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const txCount = await prisma.bankTransaction.count({
    where: { 
      bankAccount: {
        organizationId: '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d'
      }
    }
  });

  console.log(`Current transaction count for DP Sistemas: ${txCount}`);
  
  if (txCount > 0) {
    const latest = await prisma.bankTransaction.findMany({
      where: { 
        bankAccount: {
          organizationId: '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d'
        }
      },
      orderBy: { date: 'desc' },
      take: 5
    });
    console.log('Latest transactions:');
    latest.forEach(tx => console.log(`- ${tx.date.toISOString()} | ${tx.description} | ${tx.amount}`));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
