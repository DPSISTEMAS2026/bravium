import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Ultimos 5 Archivos Ingeridos (Drive/Manual) ---');
  const txs = await prisma.bankTransaction.findMany({
    select: {
      metadata: true,
      createdAt: true,
      bankAccount: { select: { bankName: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  const files = new Map();
  for (const tx of txs) {
      const meta = tx.metadata as any;
      const sourceFile = meta?.sourceFile || 'Unknown';
      if (!files.has(sourceFile)) {
          files.set(sourceFile, {
              name: sourceFile,
              count: 0,
              firstCreated: tx.createdAt,
              lastCreated: tx.createdAt,
              bank: tx.bankAccount.bankName
          });
      }
      const f = files.get(sourceFile);
      f.count++;
      if (tx.createdAt < f.firstCreated) f.firstCreated = tx.createdAt;
      if (tx.createdAt > f.lastCreated) f.lastCreated = tx.createdAt;
  }

  const sortedFiles = Array.from(files.values()).sort((a, b) => b.lastCreated.getTime() - a.lastCreated.getTime());

  sortedFiles.slice(0, 5).forEach(f => {
      console.log(`[${f.lastCreated.toISOString()}] Archivo: ${f.name}`);
      console.log(`   Banco: ${f.bank} | Movimientos: ${f.count}`);
      console.log('--------------------------------------------------');
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
