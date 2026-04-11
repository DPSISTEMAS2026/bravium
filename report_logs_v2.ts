import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Ultimos 10 Trabajos de Sincronización/Match ---');
  const syncLogs = await prisma.syncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 10
  });

  syncLogs.forEach(log => {
      console.log(`[${log.startedAt.toISOString()}] ${log.type} | ${log.status} | OrgId: ${log.organizationId}`);
      console.log(`   Message: ${log.message}`);
      if (log.totalFound !== null) {
          console.log(`   Found: ${log.totalFound} | Created: ${log.created} | Skipped: ${log.skipped} | Errors: ${log.errors}`);
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
      const tx = m.transaction as any;
      const dte = m.dte as any;
      const dateStr = tx?.date ? new Date(tx.date).toLocaleDateString() : 'N/A';
      console.log(`[${m.createdAt.toISOString()}] Match ${m.status} (Origin: ${m.origin})`);
      console.log(`   Tx: ${tx?.description} (${dateStr}) | Amount: ${tx?.amount}`);
      console.log(`   DTE: Folio ${dte?.folio} | Provider: ${dte?.provider?.name}`);
      console.log('--------------------------------------------------');
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
