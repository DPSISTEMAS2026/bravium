import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

// Febrero folios
const FOLIOS = [
  35, 37, 51, 343, 457, 458, 460, 465, 475, 741, 764, 792, 2432, 2827, 2895, 3016, 3017,
  3213, 4644, 5415, 5683, 6508, 6649, 6650, 6654, 6690, 6691, 6692, 6702, 6705, 7138,
  10608, 10609, 10615, 10618, 10619, 10622, 10623, 10630, 10631, 10649, 11329, 11575,
  11590, 12117, 14894, 14911, 14915, 17945, 18138, 18357, 18452, 18725, 21959, 21960,
  21961, 21962, 26840, 26851, 26859, 26874, 26882, 27811, 32568, 32628, 32737, 32883,
  37837, 44125, 46611, 63662, 70077, 70294, 70628, 77533, 101875, 103294, 103741, 103942,
  419013, 421261, 421900, 494756, 495232, 633017, 633052, 633219, 635796, 635880,
  864822, 892442, 892578, 892919, 988557, 1167905, 1259569, 1259618, 1259767, 1259939,
  1259962, 1260031, 1260032, 1447780, 1452753, 2010502, 2013984, 2014812, 2272705,
  3573121, 5516267, 5548699, 5549267, 5550408, 5552764, 5552902, 5554099, 5554611,
  5821903, 13078811, 25980524, 37195250, 52707976, 145272170,
  // Ranges parsed
  12046096, 12046087, 2494151, 5171298, 420334, 420335, 420336, 420337, 7900, 7901, 7902
];

async function main() {
  const uniqueFolios = [...new Set(FOLIOS)].sort((a, b) => a - b);
  const fromDate = new Date(2026, 1, 1); // Feb 1
  const toDate = new Date(2026, 2, 1);   // Mar 1
  const lines: string[] = [];
  const log = (s: string) => lines.push(s);

  const dtes = await prisma.dTE.findMany({
    where: {
      folio: { in: uniqueFolios },
      issuedDate: { gte: fromDate, lt: toDate },
    },
    include: {
      matches: { select: { id: true, status: true, origin: true, confidence: true, ruleApplied: true } },
      provider: { select: { name: true, rut: true } },
    },
    orderBy: { folio: 'asc' },
  });

  const foundMap = new Map<number, typeof dtes>();
  for (const dte of dtes) {
    if (!foundMap.has(dte.folio)) foundMap.set(dte.folio, []);
    foundMap.get(dte.folio)!.push(dte);
  }

  const withConfirmed: any[] = [];
  const withDraft: any[] = [];
  const noMatch: any[] = [];
  const notFoundFolios: number[] = [];

  for (const folio of uniqueFolios) {
    const dtesF = foundMap.get(folio);
    if (!dtesF || dtesF.length === 0) { notFoundFolios.push(folio); continue; }
    for (const dte of dtesF) {
      const c = dte.matches.filter((m: any) => m.status === 'CONFIRMED');
      const d = dte.matches.filter((m: any) => m.status === 'DRAFT');
      if (c.length > 0) withConfirmed.push(dte);
      else if (d.length > 0) withDraft.push(dte);
      else noMatch.push(dte);
    }
  }

  log(`VERIFICACION FEBRERO 2026`);
  log(`Total folios: ${uniqueFolios.length}`);
  log(`========================================`);
  log(`DTEs en febrero: ${dtes.length}`);
  log(`CONFIRMED: ${withConfirmed.length}`);
  log(`DRAFT: ${withDraft.length}`);
  log(`SIN MATCH: ${noMatch.length}`);
  log(`No en febrero: ${notFoundFolios.length}`);
  log(`========================================`);

  if (noMatch.length > 0) {
    log(`\n--- SIN MATCH (${noMatch.length}) ---`);
    for (const dte of noMatch) {
      log(`  Folio ${dte.folio} | Tipo ${dte.type} | $${dte.totalAmount} | ${dte.paymentStatus} | ${dte.provider?.name || dte.rutIssuer}`);
    }
  }

  if (withDraft.length > 0) {
    log(`\n--- DRAFT (${withDraft.length}) ---`);
    for (const dte of withDraft) {
      log(`  Folio ${dte.folio} | Tipo ${dte.type} | $${dte.totalAmount} | ${dte.provider?.name || dte.rutIssuer}`);
    }
  }

  log(`\n--- CONFIRMED (${withConfirmed.length}) ---`);
  for (const dte of withConfirmed) {
    const c = dte.matches.find((m: any) => m.status === 'CONFIRMED');
    log(`  Folio ${dte.folio} | Tipo ${dte.type} | $${dte.totalAmount} | ${c?.origin} | ${c?.ruleApplied || '?'} | ${dte.provider?.name || dte.rutIssuer}`);
  }

  fs.writeFileSync('scripts/february_report.txt', lines.join('\n'), 'utf8');
  console.log(`Reporte: scripts/february_report.txt (${lines.length} lineas)`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
