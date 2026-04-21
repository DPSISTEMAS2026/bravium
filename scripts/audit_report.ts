import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dtes = await prisma.dTE.findMany({
    select: {
      id: true,
      folio: true,
      issuedDate: true,
      paymentStatus: true,
      provider: { select: { name: true } },
      matches: {
        select: {
          status: true,
        }
      }
    },
    orderBy: { issuedDate: 'asc' }
  });

  const monthStats: Record<string, { total: number; reconciled: number; pendingFolios: any[] }> = {};

  dtes.forEach(dte => {
    const month = dte.issuedDate.toISOString().slice(0, 7); // YYYY-MM
    if (!monthStats[month]) {
      monthStats[month] = { total: 0, reconciled: 0, pendingFolios: [] };
    }

    monthStats[month].total++;

    const isReconciled = dte.paymentStatus === 'PAID' || dte.matches.some(m => m.status === 'CONFIRMED');

    if (isReconciled) {
      monthStats[month].reconciled++;
    } else {
      monthStats[month].pendingFolios.push({
        folio: dte.folio,
        provider: dte.provider?.name || 'Desconocido',
        date: dte.issuedDate.toISOString().slice(0, 10),
        status: dte.paymentStatus
      });
    }
  });

  let mdOutput = '# Reporte de Conciliación por Mes\n\n';
  mdOutput += 'A continuación se presentan los porcentajes de conciliación por mes y los folios pendientes.\n\n';

  for (const month of Object.keys(monthStats).sort()) {
    const stats = monthStats[month];
    const percentage = stats.total === 0 ? 0 : ((stats.reconciled / stats.total) * 100).toFixed(2);
    
    mdOutput += `## Mes: ${month}\n`;
    mdOutput += `- **Total DTEs:** ${stats.total}\n`;
    mdOutput += `- **Conciliados:** ${stats.reconciled} (${percentage}%)\n`;
    mdOutput += `- **Pendientes:** ${stats.total - stats.reconciled}\n\n`;
    
    if (stats.pendingFolios.length > 0) {
      mdOutput += `### Folios Pendientes (${stats.total - stats.reconciled})\n\n`;
      mdOutput += `| Folio | Proveedor | Fecha | Estado |\n`;
      mdOutput += `|---|---|---|---|\n`;
      stats.pendingFolios.forEach(p => {
        mdOutput += `| ${p.folio} | ${p.provider} | ${p.date} | ${p.status} |\n`;
      });
      mdOutput += `\n`;
    }
  }

  const fs = require('fs');
  fs.writeFileSync('reporte_conciliacion.md', mdOutput, 'utf-8');
  console.log('Reporte guardado en reporte_conciliacion.md');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
