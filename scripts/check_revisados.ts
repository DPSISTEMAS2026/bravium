import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orgId = '715545b8-4522-4bb1-be81-3047546c0e8c';
  
  const txs = await prisma.bankTransaction.findMany({
    where: { 
      bankAccount: { organizationId: orgId },
      OR: [
        { description: { contains: 'revisado', mode: 'insensitive' } },
        { matches: { some: { notes: { not: null } } } }
      ]
    },
    include: { matches: true }
  });

  console.log(`Found ${txs.length} transactions with "revisado" or notes.`);
  txs.forEach(t => {
    console.log(`ID: ${t.id}`);
    console.log(`  Desc: ${t.description}`);
    console.log(`  Status: ${t.status}`);
    t.matches.forEach(m => {
      console.log(`    Match Note: ${m.notes}`);
    });
    console.log(`  Metadata: ${JSON.stringify(t.metadata)}`);
    console.log('---');
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
