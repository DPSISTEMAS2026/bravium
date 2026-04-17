import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dpId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d';
  
  const txs = await prisma.bankTransaction.findMany({
    where: { 
      bankAccount: { organizationId: dpId }
    },
    include: { bankAccount: true },
    orderBy: { date: 'desc' },
    take: 20
  });

  console.log(`DP Sistemas has ${txs.length} transactions at top (last 20).`);
  txs.forEach(t => {
    console.log(`ID: ${t.id} | Date: ${t.date.toISOString()} | Desc: ${t.description} | Org: ${t.bankAccount.organizationId}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
