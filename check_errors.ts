import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  console.log(`\n======================================================`);
  console.log(`🚨 REPORTE DE ERRORES DEL SISTEMA (Últimas 48h)`);
  console.log(`======================================================\n`);

  // 1. Trabajos Fallidos (SyncLog)
  const failedJobs = await prisma.syncLog.findMany({
    where: { 
        status: 'FAILED',
        startedAt: { gte: fortyEightHoursAgo }
    },
    orderBy: { startedAt: 'desc' }
  });

  console.log(`--- [ TRABAJOS FALLIDOS ] ---`);
  if (failedJobs.length === 0) {
    console.log(`✅ No se han registrado fallos en trabajos automáticos en las últimas 48h.`);
  } else {
    failedJobs.forEach(log => {
      const date = log.startedAt.toLocaleDateString('es-CL');
      const time = log.startedAt.toLocaleTimeString('es-CL');
      console.log(`❌ [${date} ${time}] ${log.type.padEnd(12)} | ${log.message}`);
    });
  }

  // 2. Errores de Auditoría o Eventos de Sistema
  const auditErrors = await prisma.auditLog.findMany({
    where: { 
        action: { contains: 'ERROR', mode: 'insensitive' },
        createdAt: { gte: fortyEightHoursAgo }
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`\n--- [ EVENTOS DE AUDITORÍA CON ERROR ] ---`);
  if (auditErrors.length === 0) {
    console.log(`✅ No se han registrado eventos de error en la auditoría.`);
  } else {
    auditErrors.forEach(log => {
      const date = log.createdAt.toLocaleDateString('es-CL');
      const time = log.createdAt.toLocaleTimeString('es-CL');
      console.log(`🔴 [${date} ${time}] Action: ${log.action} | Entity: ${log.entityType} | Payload: ${JSON.stringify(log.newValue)}`);
    });
  }

  // 3. Chequear si hay transacciones con status 'UNMATCHED' o similar que sugieran problemas de ingesta
  const unmatchedTxs = await prisma.bankTransaction.count({
      where: { 
          status: 'UNMATCHED',
          createdAt: { gte: fortyEightHoursAgo }
      }
  });

  console.log(`\n--- [ ESTADO DE TRANSACCIONES ] ---`);
  if (unmatchedTxs > 0) {
      console.log(`⚠️ Se han detectado ${unmatchedTxs} transacciones marcadas como "UNMATCHED" recientemente.`);
  } else {
      console.log(`✅ No hay transacciones fallidas o sin match forzado recientemente.`);
  }

  console.log(`\n======================================================\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
