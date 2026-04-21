import { PrismaClient, MatchStatus, TransactionStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- AUTO-ACEPTANDO SUGERENCIAS CON CUADRATURA PERFECTA ---');

  const suggestions = await prisma.matchSuggestion.findMany({
    where: { status: 'PENDING' },
    include: { dte: true }
  });

  console.log(`Tenemos ${suggestions.length} sugerencias PENDING de nuestro propio Motor.`);

  let acceptedCount = 0;

  for (const sug of suggestions) {
    if (!sug.dte || sug.dte.paymentStatus === 'PAID') continue;
    
    const txIds = sug.transactionIds as string[];
    if (!txIds || txIds.length === 0) continue;

    const txs = await prisma.bankTransaction.findMany({ where: { id: { in: txIds } } });
    if (txs.length === 0) continue;

    const totalTxAmount = txs.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const dteAmount = Math.abs(Number(sug.dte.totalAmount));

    // Si la suma de las transacciones (usualmente 1) hace CUADRATURA PERFECTA ($0 de diferencia)
    if (Math.abs(totalTxAmount - dteAmount) === 0) {
        console.log(`✅ Cuadratura Perfecta: Folio ${sug.dte.folio} por $${dteAmount}`);
        
        await prisma.$transaction(async (txPrisma) => {
            for (const txId of txIds) {
                await txPrisma.reconciliationMatch.create({
                    data: {
                        transactionId: txId,
                        dteId: sug.dteId,
                        origin: 'MANUAL',
                        status: MatchStatus.CONFIRMED, // Lo confirmamos al tiro
                        confidence: sug.confidence,
                        ruleApplied: `AutoAccept Perfect Match (Sugerencia ${sug.id})`,
                        createdBy: 'SYSTEM_BULK_ACCEPT',
                    }
                });

                await txPrisma.bankTransaction.update({
                    where: { id: txId },
                    data: { status: TransactionStatus.MATCHED }
                });
            }

            await txPrisma.dTE.update({
                where: { id: sug.dteId },
                data: { paymentStatus: 'PAID', outstandingAmount: 0 }
            });

            await txPrisma.matchSuggestion.update({
                where: { id: sug.id },
                data: { status: 'ACCEPTED' }
            });
        });

        acceptedCount++;
    }
  }

  console.log(`\n--- PROCEDIMIENTO FINALIZADO ---`);
  console.log(`Sugerencias Auto-Aceptadas masivamente por Cuadratura Perfecta: ${acceptedCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
