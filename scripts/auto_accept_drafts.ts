import { PrismaClient, TransactionStatus, MatchStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- AUTO-ACEPTANDO BORRADORES (DRAFT MATCHES) DE CUADRATURA PERFECTA ---');

  const draftMatches = await prisma.reconciliationMatch.findMany({
    where: { status: 'DRAFT' },
    include: {
      transaction: true,
      dte: true
    }
  });

  console.log(`Borradores encontrados en el sistema: ${draftMatches.length}`);

  let acceptedCount = 0;

  for (const draft of draftMatches) {
    if (!draft.dte || !draft.transaction) continue;
    if (draft.dte.paymentStatus === 'PAID') continue;
    
    // Comparar monto
    const txAmount = Math.abs(Number(draft.transaction.amount));
    const dteAmount = Math.abs(Number(draft.dte.totalAmount));

    // Si cuadran exactamente
    if (Math.abs(txAmount - dteAmount) === 0) {
      console.log(`✅ Aceptando Borrador (Cuadratura Perfecta): Folio ${draft.dte.folio} por $${txAmount}`);
      
      await prisma.$transaction(async (txPrisma) => {
        // Actualizar el estado del Match a CONFIRMED
        await txPrisma.reconciliationMatch.update({
          where: { id: draft.id },
          data: { 
            status: MatchStatus.CONFIRMED,
            origin: 'MANUAL',
            confirmedAt: new Date(),
            ruleApplied: 'Validado por Script de AutoAccept'
          }
        });

        // Actualizar transaccion
        await txPrisma.bankTransaction.update({
          where: { id: draft.transactionId },
          data: { status: TransactionStatus.MATCHED }
        });

        // Actualizar DTE
        await txPrisma.dTE.update({
          where: { id: draft.dteId! },
          data: { paymentStatus: 'PAID', outstandingAmount: 0 }
        });
      });
      acceptedCount++;
    }
  }

  console.log(`\n--- FINALIZADO ---`);
  console.log(`Borradores aceptados exitosamente: ${acceptedCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
