import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Ultimos 10 Trabajos de Sincronización/Match ---');
  const syncLogs = await prisma.syncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 10,
    include: {
        organization: { select: { name: true } }
    }
  });

  syncLogs.forEach(log => {
      console.log(`[${log.startedAt.toISOString()}] ${log.type} | ${log.status} | Org: ${log.organization?.name || 'Global'}`);
      console.log(`   Message: ${log.message}`);
      if (log.totalFound !== null) {
          console.log(`   Processed: ${log.totalFound} | Created: ${log.created} | Skipped: ${log.skipped} | Errors: ${log.errors}`);
      }
      console.log('--------------------------------------------------');
  });

  console.log('\n--- Ultimos 5 Matches Confirmados ---');
  const matches = await prisma.reconciliationMatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      transaction: { select: { description: true, amount: true, date: true } },
      dte: { select: { folio: true, provider: { select: { name: true } } } }
    }
  });

  matches.forEach(m => {
      const dateStr = m.transaction?.date ? new Date(m.transaction.date).toLocaleDateString() : 'N/A';
      console.log(`[${m.createdAt.toISOString()}] Match ${m.status} (${m.origin})`);
      console.log(`   Tx: ${m.transaction?.description} (${dateStr}) | Amount: ${m.transaction?.amount}`);
      console.log(`   DTE: Folio ${m.dte?.folio} | Provider: ${m.dte?.provider?.name}`);
      console.log('--------------------------------------------------');
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
