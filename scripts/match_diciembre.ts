import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Excel dates are number of days since Jan 1, 1900.
// JavaScript dates are ms since Jan 1, 1970.
// 25569 is the difference in days between 1900 and 1970.
function excelDateToJsDate(excelDate: number) {
  return new Date(Math.round((excelDate - 25569) * 86400 * 1000));
}

async function main() {
  console.log('Cargando Excel...');
  const wb = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2025.xlsx');
  const data = xlsx.utils.sheet_to_json<any>(wb.Sheets['Diciembre 2025']);

  let matched = 0;
  let notFound = 0;

  for (const row of data) {
    const isFactura = row['Factura'] != null && String(row['Factura']).trim() !== '';
    const folio = isFactura ? parseInt(String(row['Factura']).trim()) : undefined;
    const amount = row[' Valor '] != null ? parseFloat(String(row[' Valor '])) : undefined;
    const paymentMethod = row['Transferencia Banco / Tarjeta'] || '';

    // Solo vamos a intentar conciliar las que tienen Folio de Factura y Monto, 
    // y que el medio de pago diga SANTANDER (ya que la TC aún no la cargamos)
    if (folio && amount && paymentMethod.toUpperCase().includes('SANTANDER')) {
      
      // 1. Encontrar el DTE
      const dte = await prisma.dTE.findFirst({
        where: { folio, totalAmount: amount, paymentStatus: { not: 'PAID' } }
      });

      if (!dte) {
        console.log(`No se encontró DTE Folio ${folio} o ya está pagado.`);
        notFound++;
        continue;
      }

      // 2. Encontrar Transacción Bancaria
      // Buscar una transacción en Santander con ese monto exacto
      const tx = await prisma.bankTransaction.findFirst({
        where: {
            amount: -Math.abs(amount), // Cargos son negativos
            status: { not: 'MATCHED' }
        }
      });

      if (!tx) {
        console.log(`DTE Folio ${folio}: No se encontró Transacción Bancaria por -${amount}.`);
        notFound++;
        continue;
      }

      await prisma.reconciliationMatch.create({
        data: {
          organizationId: dte.organizationId,
          transactionId: tx.id,
          dteId: dte.id,
          status: 'CONFIRMED',
          confidence: 1.0,
          ruleApplied: 'EXCEL_DICIEMBRE_2025_MANUAL',
          origin: 'MANUAL',
          confirmedAt: new Date()
        }
      });

      // 4. Actualizar estados
      await prisma.bankTransaction.update({
        where: { id: tx.id },
        data: { status: 'MATCHED' }
      });

      await prisma.dTE.update({
        where: { id: dte.id },
        data: { paymentStatus: 'PAID', outstandingAmount: 0 }
      });

      console.log(`✅ Match creado: Folio ${folio} <-> Tx ${formatTx(tx)}`);
      matched++;
    }
  }

  console.log(`\nResumen: ${matched} matches automáticos creados desde el Excel. (${notFound} no encontrados/ya listos).`);
}

function formatTx(tx: any) {
    return `${tx.date.toISOString().split('T')[0]} [${tx.amount}] ${tx.description}`;
}

main().catch(console.error).finally(() => prisma.$disconnect());
