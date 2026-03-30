
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  
  // Rango para HOY (desde las 00:00 local, asumiendo UTC-3 para Chile o simplemente inicio de día UTC)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  console.log(`\n======================================================`);
  console.log(`📊 RESUMEN DIARIO DE TRABAJOS - ${now.toLocaleDateString()}`);
  console.log(`======================================================\n`);

  // 1. Trabajos de Sincronización (SyncLog)
  const syncLogs = await prisma.syncLog.findMany({
    where: { startedAt: { gte: todayStart } },
    orderBy: { startedAt: 'desc' }
  });

  console.log(`--- [ TRABAJOS AUTOMÁTICOS ] ---`);
  if (syncLogs.length === 0) {
    console.log(`No se han registrado trabajos automáticos hoy.`);
  } else {
    syncLogs.forEach(log => {
      const time = log.startedAt.toLocaleTimeString('es-CL');
      const statusIcon = log.status === 'SUCCESS' ? '✅' : (log.status === 'RUNNING' ? '⏳' : '❌');
      console.log(`${statusIcon} [${time}] ${log.type.padEnd(12)} | ${log.status.padEnd(8)} | ${log.message}`);
    });
  }

  // 2. Actividad Manual Manual (ReconciliationMatch)
  const manualMatches = await prisma.reconciliationMatch.findMany({
    where: { 
        createdAt: { gte: todayStart },
        origin: 'MANUAL'
    },
    include: {
      transaction: { select: { description: true, amount: true } },
      dte: { select: { folio: true, provider: { select: { name: true } } } }
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`\n--- [ CONCILIACIONES MANUALES ] ---`);
  if (manualMatches.length === 0) {
    console.log(`No hay conciliaciones manuales realizadas hoy.`);
  } else {
    manualMatches.forEach(m => {
      const time = m.createdAt.toLocaleTimeString('es-CL');
      const txDesc = m.transaction?.description?.substring(0, 30) || 'Sin desc';
      const provider = m.dte?.provider?.name || 'Prov. Desconocido';
      console.log(`📍 [${time}] Matched: ${txDesc.padEnd(30)} -> Folio ${m.dte?.folio} (${provider})`);
    });
  }

  // 3. Auditoría Reciente (Borrado de matches, etc)
  const auditLogs = await prisma.auditLog.findMany({
    where: { 
        createdAt: { gte: todayStart },
        action: { in: ['MATCH_DELETED', 'REJECT_SUGGESTION'] }
    },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  if (auditLogs.length > 0) {
    console.log(`\n--- [ OTRAS ACCIONES RECIENTES ] ---`);
    auditLogs.forEach(log => {
      const time = log.createdAt.toLocaleTimeString('es-CL');
      console.log(`⚠️ [${time}] ${log.action.padEnd(15)} | Entity: ${log.entityType} ID: ${log.entityId.substring(0,8)}...`);
    });
  }

  // 4. Ingesta de Archivos
  const recentTxs = await prisma.bankTransaction.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { metadata: true }
  });

  const files = new Set<string>();
  recentTxs.forEach(tx => {
      const source = (tx.metadata as any)?.sourceFile;
      if (source) files.add(source);
  });

  console.log(`\n--- [ ARCHIVOS PROCESADOS ] ---`);
  if (files.size === 0) {
    console.log(`No se han ingerido nuevos archivos hoy.`);
  } else {
    files.forEach(f => console.log(`📄 ${f}`));
  }

  console.log(`\n======================================================\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
