import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d';
  
  const txs = await prisma.bankTransaction.findMany({
    where: { 
      bankAccount: { organizationId: orgId },
      date: {
        gte: new Date('2026-01-01'),
        lte: new Date('2026-12-31')
      }
    },
    include: { bankAccount: true }
  });

  console.log(`DP Sistemas has ${txs.length} transactions for 2026.`);
  
  const sources = new Set();
  txs.forEach(t => {
    const meta = t.metadata as any;
    sources.add(meta?.source || t.origin || 'Unknown');
  });

  console.log('Sources found:', Array.from(sources));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
