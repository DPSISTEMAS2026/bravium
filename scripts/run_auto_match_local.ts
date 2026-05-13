/**
 * run_auto_match_local.ts
 * 
 * Ejecuta el motor de conciliación directamente contra la BD (sin NestJS).
 * Replica la lógica del SchedulerService.processTenantAutomation().
 * 
 * Solo ejecuta match por contenido exacto y monto para los 14 movimientos nuevos.
 */

import { PrismaClient, TransactionType, TransactionStatus, MatchStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  AUTO-MATCH LOCAL (directo contra BD)');
  console.log('  Fecha:', new Date().toISOString());
  console.log('='.repeat(60) + '\n');

  const org = await prisma.organization.findFirst({
    where: { isActive: true, fintocApiKey: { not: null } }
  });

  if (!org) throw new Error('No org found');
  console.log(`📌 Organización: ${org.name}`);

  // Buscar transacciones PENDING de los últimos 60 días (tipo DEBIT para matchear contra facturas)
  const today = new Date();
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const pendingTxs = await prisma.bankTransaction.findMany({
    where: {
      status: { in: [TransactionStatus.PENDING, TransactionStatus.PARTIALLY_MATCHED] },
      type: TransactionType.DEBIT,
      date: { gte: sixtyDaysAgo, lte: today },
      bankAccount: { organizationId: org.id }
    },
    include: { bankAccount: { select: { bankName: true, accountNumber: true } } },
    orderBy: { date: 'asc' }
  });

  console.log(`📋 Transacciones PENDING (DEBIT, últimos 60 días): ${pendingTxs.length}\n`);

  // Buscar DTEs UNPAID
  const unpaidDtes = await prisma.dTE.findMany({
    where: {
      paymentStatus: 'UNPAID',
      organizationId: org.id
    },
    include: { provider: { select: { name: true, rut: true } } }
  });

  console.log(`📋 DTEs UNPAID disponibles: ${unpaidDtes.length}\n`);

  // Limpiar DRAFT previos de estas transacciones para re-evaluar
  const txIds = pendingTxs.map(t => t.id);
  const deletedDrafts = await prisma.reconciliationMatch.deleteMany({
    where: {
      transactionId: { in: txIds },
      status: MatchStatus.DRAFT
    }
  });

  if (deletedDrafts.count > 0) {
    console.log(`🧹 Limpiados ${deletedDrafts.count} DRAFT previos\n`);
  }

  const usedDteIds = new Set<string>();
  const usedTxIds = new Set<string>();
  let matchCount = 0;

  // === Estrategia 1: Match Exacto por Monto ===
  console.log('🔍 Estrategia 1: Match exacto por monto...');
  
  for (const tx of pendingTxs) {
    if (usedTxIds.has(tx.id)) continue;
    const txAmount = Math.abs(tx.amount);

    // Buscar DTE con mismo monto (match exacto)
    const exactMatch = unpaidDtes.find(dte => 
      !usedDteIds.has(dte.id) && 
      dte.totalAmount === txAmount &&
      dte.type !== 61 // Excluir notas de crédito
    );

    if (exactMatch) {
      // Verificar proximidad de fecha (max 90 días entre factura y pago)
      const dateDiff = Math.abs(
        new Date(tx.date).getTime() - new Date(exactMatch.issuedDate).getTime()
      ) / (1000 * 60 * 60 * 24);

      if (dateDiff > 90) continue;

      // Crear match DRAFT
      await prisma.reconciliationMatch.create({
        data: {
          transactionId: tx.id,
          dteId: exactMatch.id,
          origin: 'AUTOMATIC',
          status: MatchStatus.DRAFT,
          confidence: dateDiff <= 7 ? 0.95 : dateDiff <= 30 ? 0.85 : 0.70,
          ruleApplied: `ExactAmount - Monto: $${txAmount.toLocaleString()} | Factura F${exactMatch.folio} (${exactMatch.provider?.name || 'N/A'})`,
          organizationId: org.id,
        }
      });

      await prisma.bankTransaction.update({
        where: { id: tx.id },
        data: { status: TransactionStatus.PARTIALLY_MATCHED }
      });

      usedTxIds.add(tx.id);
      usedDteIds.add(exactMatch.id);
      matchCount++;

      console.log(`  ✅ MATCH: $${txAmount.toLocaleString()} | ${tx.description?.slice(0, 40)} → F${exactMatch.folio} (${exactMatch.provider?.name || 'N/A'}) [${dateDiff.toFixed(0)}d]`);
    }
  }

  // === Estrategia 2: Match por RUT (descripción contiene el RUT del proveedor) ===
  console.log('\n🔍 Estrategia 2: Match por RUT en descripción...');

  for (const tx of pendingTxs) {
    if (usedTxIds.has(tx.id)) continue;
    const txAmount = Math.abs(tx.amount);
    const desc = tx.description || '';

    // Extraer RUT de la descripción (formato XX.XXX.XXX-X o XXXXXXXX-X)
    const rutMatch = desc.match(/(\d{1,2}[\.\d]*\d-[\dkK])/);
    if (!rutMatch) continue;
    const rutInDesc = rutMatch[1].replace(/\./g, '');

    // Buscar DTEs del mismo proveedor (por RUT) con monto similar (±5%)
    const candidates = unpaidDtes.filter(dte => {
      if (usedDteIds.has(dte.id)) return false;
      if (dte.type === 61) return false;
      
      const provRut = dte.provider?.rut?.replace(/\./g, '') || dte.rutIssuer?.replace(/\./g, '');
      if (!provRut || provRut !== rutInDesc) return false;

      const amtDiff = Math.abs(dte.totalAmount - txAmount) / txAmount;
      return amtDiff <= 0.05; // 5% tolerance
    });

    if (candidates.length === 1) {
      const dte = candidates[0];
      const dateDiff = Math.abs(
        new Date(tx.date).getTime() - new Date(dte.issuedDate).getTime()
      ) / (1000 * 60 * 60 * 24);

      if (dateDiff > 90) continue;

      await prisma.reconciliationMatch.create({
        data: {
          transactionId: tx.id,
          dteId: dte.id,
          origin: 'AUTOMATIC',
          status: MatchStatus.DRAFT,
          confidence: 0.80,
          ruleApplied: `RUT+Amount - RUT: ${rutInDesc} | Monto: $${txAmount.toLocaleString()} → F${dte.folio} (${dte.provider?.name || 'N/A'})`,
          organizationId: org.id,
        }
      });

      await prisma.bankTransaction.update({
        where: { id: tx.id },
        data: { status: TransactionStatus.PARTIALLY_MATCHED }
      });

      usedTxIds.add(tx.id);
      usedDteIds.add(dte.id);
      matchCount++;

      console.log(`  ✅ MATCH: $${txAmount.toLocaleString()} | RUT ${rutInDesc} → F${dte.folio} (${dte.provider?.name || 'N/A'}) [${dateDiff.toFixed(0)}d]`);
    }
  }

  // Resumen
  const stillPending = pendingTxs.length - usedTxIds.size;
  
  console.log('\n' + '='.repeat(60));
  console.log('  RESUMEN AUTO-MATCH');
  console.log('='.repeat(60));
  console.log(`  📋 Transacciones procesadas:  ${pendingTxs.length}`);
  console.log(`  ✅ Matches creados (DRAFT):   ${matchCount}`);
  console.log(`  ⏳ Sin match (pendientes):    ${stillPending}`);
  console.log(`  📑 DTEs disponibles restantes: ${unpaidDtes.length - usedDteIds.size}`);
  console.log('='.repeat(60));
  console.log('\n💡 Los matches están en DRAFT — confirmar manualmente en el dashboard de conciliación.\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
