import { PrismaClient, TransactionStatus, MatchStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const drafts = await prisma.reconciliationMatch.findMany({
    where: { status: 'DRAFT' },
    include: { transaction: true, dte: true }
  });

  console.log(`Borradores: ${drafts.length}`);
  for (const draft of drafts) {
    const txAmount = Math.abs(Number(draft.transaction.amount));
    const dteAmount = Math.abs(Number(draft.dte.totalAmount));
    if (Math.abs(txAmount - dteAmount) === 0 && draft.dte.paymentStatus === 'UNPAID') {
        console.log(`Accepting ${draft.dte.folio}`);
        await prisma.$transaction(async (txPrisma) => {
            await txPrisma.reconciliationMatch.update({
              where: { id: draft.id },
              data: { status: MatchStatus.CONFIRMED, origin: 'MANUAL' }
            });
            await txPrisma.bankTransaction.update({
              where: { id: draft.transactionId },
              data: { status: TransactionStatus.MATCHED }
            });
            await txPrisma.dTE.update({
              where: { id: draft.dteId! },
              data: { paymentStatus: 'PAID', outstandingAmount: 0 }
            });
        });
        console.log(`Success ${draft.dte.folio}`);
    }
  }
}
main().finally(() => prisma.$disconnect());
