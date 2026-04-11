import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

const FOLIOS = [
  1, 9, 33, 35, 48, 49, 50, 328, 334, 336, 352, 354, 365, 366, 375, 376, 377, 389,
  682, 687, 782, 801, 803, 804, 819, 825, 827, 828, 829, 830, 831, 1628, 2362, 2431,
  2507, 2765, 2861, 2862, 4441, 4860, 5320, 5354, 5357, 5641, 5658, 6403, 6404, 6409,
  6443, 6444, 6592, 6593, 7092, 7169, 7185, 10503, 10520, 10521, 10538, 10592, 11197,
  11198, 11223, 11283, 11284, 11285, 11286, 11401, 11420, 11445, 13491, 14841, 14844,
  14845, 14860, 14867, 14874, 14884, 14893, 14896, 16921, 17631, 17658, 19095, 21311,
  21728, 21729, 21730, 21731, 21732, 21733, 21734, 21735, 21736, 26736, 26737, 26749,
  26755, 26770, 26775, 26784, 26807, 26822, 26859, 26981, 31923, 31924, 32516, 32517,
  33040, 38421, 43550, 43770, 47941, 50754, 51426, 51467, 69243, 102509, 102760,
  134522, 134539, 134662, 134826, 141926, 142029, 142652, 274674, 283961, 339506,
  415285, 416423, 417717, 489791, 567578, 631709, 631821, 631882, 632018, 632881,
  844333, 859497, 892044, 1247217, 1247218, 1247259, 1247288, 1247289, 1247290,
  1247359, 1247421, 1247437, 1247438, 1247460, 1247588, 1247589, 1247633, 1247634,
  1253112, 1253478, 1253480, 2006869, 2006895, 2007519, 2009875, 2235522, 2964259,
  5511522, 5513567, 5514434, 5514464, 5515544, 5517816, 5518297, 5519062, 5547192,
  11366163, 25956254, 37185104, 37189069, 37192200, 52472825, 144953878,
  11464, 5547200, 2493871, 5170803
];

async function main() {
  const allFolios = [...new Set(FOLIOS)].sort((a, b) => a - b);
  const lines: string[] = [];
  const log = (s: string) => lines.push(s);

  log(`VERIFICACION DE DTEs DE ENERO 2026`);
  log(`Total folios a verificar: ${allFolios.length}`);
  log(``);

  const dtes = await prisma.dTE.findMany({
    where: {
      folio: { in: allFolios },
      issuedDate: { gte: new Date('2026-01-01'), lt: new Date('2026-02-01') },
    },
    include: {
      matches: { select: { id: true, status: true, origin: true, confidence: true, confirmedAt: true, ruleApplied: true } },
      provider: { select: { name: true, rut: true } },
    },
    orderBy: { folio: 'asc' },
  });

  const foundFolios = new Map<number, typeof dtes>();
  for (const dte of dtes) {
    if (!foundFolios.has(dte.folio)) foundFolios.set(dte.folio, []);
    foundFolios.get(dte.folio)!.push(dte);
  }

  const withConfirmed: any[] = [];
  const withDraft: any[] = [];
  const withRejected: any[] = [];
  const noMatch: any[] = [];
  const notFoundFolios: number[] = [];

  for (const folio of allFolios) {
    const dtesF = foundFolios.get(folio);
    if (!dtesF || dtesF.length === 0) { notFoundFolios.push(folio); continue; }
    for (const dte of dtesF) {
      const c = dte.matches.filter((m: any) => m.status === 'CONFIRMED');
      const d = dte.matches.filter((m: any) => m.status === 'DRAFT');
      const r = dte.matches.filter((m: any) => m.status === 'REJECTED');
      if (c.length > 0) withConfirmed.push(dte);
      else if (d.length > 0) withDraft.push(dte);
      else if (r.length > 0) withRejected.push(dte);
      else noMatch.push(dte);
    }
  }

  log(`========================================`);
  log(`RESUMEN`);
  log(`========================================`);
  log(`DTEs encontradas en enero 2026: ${dtes.length}`);
  log(`Con match CONFIRMED:  ${withConfirmed.length}`);
  log(`Con match DRAFT:      ${withDraft.length}`);
  log(`Con match REJECTED:   ${withRejected.length}`);
  log(`Sin ningun match:     ${noMatch.length}`);
  log(`Folios NO encontrados en enero: ${notFoundFolios.length}`);
  log(`========================================`);

  if (noMatch.length > 0) {
    log(``);
    log(`--- DTEs SIN MATCH (${noMatch.length}) ---`);
    for (const dte of noMatch) {
      log(`  Folio ${dte.folio} | Tipo ${dte.type} | $${dte.totalAmount} | PayStatus: ${dte.paymentStatus} | ${dte.provider?.name || dte.rutIssuer}`);
    }
  }

  if (withDraft.length > 0) {
    log(``);
    log(`--- DTEs CON MATCH DRAFT (${withDraft.length}) ---`);
    for (const dte of withDraft) {
      const draft = dte.matches.find((m: any) => m.status === 'DRAFT');
      log(`  Folio ${dte.folio} | Tipo ${dte.type} | $${dte.totalAmount} | Confianza: ${draft?.confidence?.toFixed(2)} | ${dte.provider?.name || dte.rutIssuer}`);
    }
  }

  if (withRejected.length > 0) {
    log(``);
    log(`--- DTEs CON MATCH REJECTED (${withRejected.length}) ---`);
    for (const dte of withRejected) {
      log(`  Folio ${dte.folio} | Tipo ${dte.type} | $${dte.totalAmount} | ${dte.provider?.name || dte.rutIssuer}`);
    }
  }

  if (notFoundFolios.length > 0) {
    log(``);
    log(`--- FOLIOS NO ENCONTRADOS EN ENERO 2026 (${notFoundFolios.length}) ---`);
    const elsewhere = await prisma.dTE.findMany({
      where: { folio: { in: notFoundFolios } },
      select: { folio: true, issuedDate: true, type: true, totalAmount: true, paymentStatus: true, provider: { select: { name: true } },
        matches: { select: { status: true } }
      },
      orderBy: { folio: 'asc' },
    });
    const elseMap = new Map<number, any[]>();
    for (const d of elsewhere) {
      if (!elseMap.has(d.folio)) elseMap.set(d.folio, []);
      elseMap.get(d.folio)!.push(d);
    }
    for (const f of notFoundFolios) {
      const els = elseMap.get(f);
      if (els && els.length > 0) {
        for (const e of els) {
          const matchInfo = e.matches.length > 0 ? e.matches.map((m: any) => m.status).join(',') : 'SIN MATCH';
          log(`  Folio ${f} -> Fecha: ${e.issuedDate.toISOString().split('T')[0]} | Tipo ${e.type} | $${e.totalAmount} | ${e.paymentStatus} | Match: ${matchInfo} | ${e.provider?.name || '?'}`);
        }
      } else {
        log(`  Folio ${f} -> No existe en la BD`);
      }
    }
  }

  log(``);
  log(`--- DTEs CON MATCH CONFIRMED (${withConfirmed.length}) ---`);
  for (const dte of withConfirmed) {
    const c = dte.matches.find((m: any) => m.status === 'CONFIRMED');
    log(`  Folio ${dte.folio} | Tipo ${dte.type} | $${dte.totalAmount} | ${c?.origin} | ${c?.ruleApplied || '?'} | ${dte.provider?.name || dte.rutIssuer}`);
  }

  fs.writeFileSync('scripts/january_report.txt', lines.join('\n'), 'utf8');
  console.log(`Reporte generado: scripts/january_report.txt (${lines.length} lineas)`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
