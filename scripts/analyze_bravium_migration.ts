import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst({
    where: { name: { contains: 'Bravium', mode: 'insensitive' } }
  });

  if (!org) {
    console.log('Organization "Bravium" not found');
    return;
  }

  console.log('Bravium Org ID:', org.id);
  console.log('Fintoc API Key present:', !!org.fintocApiKey);
  console.log('Fintoc Link Token present:', !!org.fintocLinkToken);

  const txs = await prisma.bankTransaction.findMany({
    where: { 
      bankAccount: { organizationId: org.id },
      date: {
        gte: new Date('2026-01-01'),
        lte: new Date('2026-12-31')
      }
    },
    include: { 
      matches: true,
      bankAccount: true
    }
  });

  console.log(`Bravium has ${txs.length} transactions for 2026.`);
  
  const originCounts: Record<string, number> = {};
  txs.forEach(t => {
    originCounts[t.origin] = (originCounts[t.origin] || 0) + 1;
  });

  console.log('Origins:', originCounts);
  
  const matchedCount = txs.filter(t => t.matches.length > 0).length;
  console.log(`Matched transactions: ${matchedCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
