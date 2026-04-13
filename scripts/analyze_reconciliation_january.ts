import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const organizationId = '715545b8-4522-4bb1-be81-3047546c0e8c';
  const ccAccountId = 'acc-santander-9219882-0';
  const tcAccountId = 'acc-santander-5239';
  const companyRutPrefix = '77154188';

  // 1. Obtener DTEs de Enero 2026
  const dtes = await prisma.dTE.findMany({
    where: {
      organizationId,
      rutReceiver: { contains: companyRutPrefix },
      issuedDate: {
        gte: new Date('2026-01-01T00:00:00Z'),
        lte: new Date('2026-01-31T23:59:59Z')
      }
    }
  });

  // 2. Obtener movimientos bancarios (Dic 2025 - Feb 2026) PENDIENTES
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      bankAccountId: { in: [ccAccountId, tcAccountId] },
      date: {
        gte: new Date('2025-12-01T00:00:00Z'),
        lte: new Date('2026-02-15T23:59:59Z')
      },
      status: 'PENDING'
    }
  });

  console.log(`DTEs totales (Enero): ${dtes.length}`);
  console.log(`Movimientos bancarios pendientes (Dic-Feb): ${transactions.length}`);

  let potentialMatches = 0;
  const matchDetails: any[] = [];
  const availableTxs = [...transactions];

  for (const dte of dtes) {
    const dteAmount = Math.round(Number(dte.totalAmount));
    
    // Un DTE Recibido (Compra) calza con un DEBIT (monto negativo en nuestro sistema)
    const match = availableTxs.find(t => Math.abs(t.amount) === dteAmount);

    if (match) {
      potentialMatches++;
      matchDetails.push({
        dteId: dte.id,
        dteFolio: dte.folio,
        dteAmount,
        bankTxId: match.id,
        bankTxDesc: match.description,
        bankTxDate: match.date.toISOString().split('T')[0],
        bankTxAmount: match.amount
      });
      
      const idx = availableTxs.indexOf(match);
      if (idx > -1) availableTxs.splice(idx, 1);
    }
  }

  const percentage = dtes.length > 0 ? (potentialMatches / dtes.length) * 100 : 0;

  console.log(`\n=========================================`);
  console.log(`ANÁLISIS DE CONCILIACIÓN POTENCIAL (JAN 2026)`);
  console.log(`=========================================`);
  console.log(`Facturas (DTE Enero): ${dtes.length}`);
  console.log(`Coincidencias encontradas: ${potentialMatches}`);
  console.log(`Porcentaje de Calce: ${percentage.toFixed(1)}%`);
  console.log(`=========================================`);
  
  if (matchDetails.length > 0) {
    console.log(`\nEjemplos de calces encontrados:`);
    matchDetails.slice(0, 15).forEach(m => {
        const typeStr = m.bankTxAmount < 0 ? 'CARGO' : 'ABONO';
        console.log(`- Folio ${m.dteFolio} ($${m.dteAmount.toLocaleString()}) -> [${typeStr}] ${m.bankTxDesc} (${m.bankTxDate})`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
