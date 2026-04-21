import * as xlsx from 'xlsx';
import { PrismaClient, MatchStatus, TransactionStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- AUTO-ACEPTANDO SUGERENCIAS USANDO EXCEL COMO FILTRO DE SEGURIDAD ---');

  // 1. Cargar Excel
  const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

  // 2. Extraer los datos válidos de CC Santander
  const excelSantanderMap = new Map(); // folio -> amount
  let countExcelRows = 0;

  for (const row of rawData as any[]) {
    const cuenta = String(row['Transferencia Banco / Tarjeta'] || '').toUpperCase();
    if (cuenta.includes('SANTANDER') && !cuenta.includes('TC')) {
      const folio = String(row['Factura']).trim();
      const amount = Number(row[' Valor ']);
      if (folio && amount) {
        excelSantanderMap.set(folio, amount);
        countExcelRows++;
      }
    }
  }
  console.log(`Filas extraidas del Excel (Cuenta Corriente Santander con Folio Válido): ${countExcelRows}`);

  // 3. Buscar sugerencias de match en estado PENDING
  const suggestions = await prisma.matchSuggestion.findMany({
    where: { status: 'PENDING' },
    include: {
      dte: true,
    }
  });

  console.log(`Sugerencias PENDING en el sistema: ${suggestions.length}`);

  let acceptedCount = 0;

  // 4. Cruzar sugerencias con el Excel
  for (const sug of suggestions) {
    if (!sug.dte || sug.dte.paymentStatus === 'PAID') continue; // omitir si ya fue pagado
    
    const dteFolio = String(sug.dte.folio);
    
    // Si este folio sugerido por el sistema existe en el Excel como Santander
    if (excelSantanderMap.has(dteFolio)) {
        const excelVal = excelSantanderMap.get(dteFolio);
        
        // Extraer transacciones bancarias de la sugerencia (nuestro sistema)
        const txIds = sug.transactionIds as string[];
        if (!txIds || txIds.length === 0) continue;

        const txs = await prisma.bankTransaction.findMany({ where: { id: { in: txIds } } });
        const totalTxAmount = txs.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

        // Validar: si el monto del tx sugerido hace match (aprox +- 100 pesos) con el valor del Excel
        if (Math.abs(totalTxAmount - excelVal) < 100) {
            console.log(`✅ ACEPTANDO (Calce de Sistema + Excel): Folio ${dteFolio} por $${totalTxAmount}`);
            
            // Replicar la lógica de aceptación del backend
            await prisma.$transaction(async (txPrisma) => {
                // Generar los Matches reales (1 a 1 para este caso simplificado)
                for (const txId of txIds) {
                    await txPrisma.reconciliationMatch.create({
                        data: {
                            transactionId: txId,
                            dteId: sug.dteId,
                            origin: 'MANUAL',
                            status: MatchStatus.CONFIRMED,
                            confidence: sug.confidence,
                            ruleApplied: `AutoAcceptExcel (Sugerencia sistema ${sug.id})`,
                            createdBy: 'SYSTEM_EXCEL_VALIDATOR',
                        }
                    });

                    // Marcar transacción como MATCHED
                    await txPrisma.bankTransaction.update({
                        where: { id: txId },
                        data: { status: TransactionStatus.MATCHED }
                    });
                }

                // Marcar DTE como PAGADO
                await txPrisma.dTE.update({
                    where: { id: sug.dteId },
                    data: { paymentStatus: 'PAID', outstandingAmount: 0 }
                });

                // Cambiar estado de sugerencia
                await txPrisma.matchSuggestion.update({
                    where: { id: sug.id },
                    data: { status: 'ACCEPTED' }
                });
            });

            acceptedCount++;
        } else {
             console.log(`⚠️ DISCREPANCIA MONTO en Folio ${dteFolio}. Sistema da $${totalTxAmount}, Excel dice $${excelVal}. No auto-aceptado.`);
        }
    }
  }

  console.log(`\n--- PROCEDIMIENTO FINALIZADO ---`);
  console.log(`Sugerencias Auto-Aceptadas con éxito: ${acceptedCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
