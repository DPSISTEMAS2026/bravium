/**
 * Script para verificar el estado de match de DTEs de enero 2026
 * Busca por folio y verifica si tienen match CONFIRMED
 */
import { PrismaClient } from '@prisma/client';

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
  11366163, 25956254, 37185104, 37189069, 37192200, 52472825, 144953878
];

// Special ranges: "11464 - 5547200" and "2493871 - 5170803" - treating as individual folios
const EXTRA_FOLIOS = [11464, 5547200, 2493871, 5170803];

async function main() {
  const allFolios = [...new Set([...FOLIOS, ...EXTRA_FOLIOS])];
  
  console.log(`\n=== VERIFICACIÓN DE DTEs DE ENERO 2026 ===`);
  console.log(`Total folios a verificar: ${allFolios.length}\n`);

  // Buscar DTEs de enero 2026 con estos folios
  const dtes = await prisma.dTE.findMany({
    where: {
      folio: { in: allFolios },
      issuedDate: {
        gte: new Date('2026-01-01'),
        lt: new Date('2026-02-01'),
      },
    },
    include: {
      matches: {
        select: {
          id: true,
          status: true,
          origin: true,
          confidence: true,
          confirmedAt: true,
          ruleApplied: true,
          transactionId: true,
        },
      },
      provider: {
        select: { name: true, rut: true },
      },
    },
    orderBy: { folio: 'asc' },
  });

  // Crear mapa de folios encontrados
  const foundFolios = new Map<number, typeof dtes[0][]>();
  for (const dte of dtes) {
    if (!foundFolios.has(dte.folio)) foundFolios.set(dte.folio, []);
    foundFolios.get(dte.folio)!.push(dte);
  }

  // Clasificar
  const withConfirmedMatch: typeof dtes = [];
  const withDraftMatch: typeof dtes = [];
  const withRejectedMatch: typeof dtes = [];
  const noMatch: typeof dtes = [];
  const notFound: number[] = [];

  for (const folio of allFolios) {
    const dtesForFolio = foundFolios.get(folio);
    if (!dtesForFolio || dtesForFolio.length === 0) {
      notFound.push(folio);
      continue;
    }
    for (const dte of dtesForFolio) {
      const confirmedMatches = dte.matches.filter(m => m.status === 'CONFIRMED');
      const draftMatches = dte.matches.filter(m => m.status === 'DRAFT');
      const rejectedMatches = dte.matches.filter(m => m.status === 'REJECTED');

      if (confirmedMatches.length > 0) {
        withConfirmedMatch.push(dte);
      } else if (draftMatches.length > 0) {
        withDraftMatch.push(dte);
      } else if (rejectedMatches.length > 0) {
        withRejectedMatch.push(dte);
      } else {
        noMatch.push(dte);
      }
    }
  }

  // RESUMEN
  console.log(`════════════════════════════════════════════════════════════`);
  console.log(`  RESUMEN`);
  console.log(`════════════════════════════════════════════════════════════`);
  console.log(`  DTEs encontradas en enero 2026: ${dtes.length}`);
  console.log(`  ✅ Con match CONFIRMED:  ${withConfirmedMatch.length}`);
  console.log(`  📋 Con match DRAFT:      ${withDraftMatch.length}`);
  console.log(`  ❌ Con match REJECTED:   ${withRejectedMatch.length}`);
  console.log(`  ⚠️  Sin ningún match:    ${noMatch.length}`);
  console.log(`  🔍 Folios NO encontrados en enero: ${notFound.length}`);
  console.log(`════════════════════════════════════════════════════════════\n`);

  // Detalle: DTEs sin match confirmado (PROBLEMAS)
  if (noMatch.length > 0) {
    console.log(`\n🚨 DTEs SIN MATCH (${noMatch.length}):`);
    console.log(`${'Folio'.padEnd(12)} ${'Tipo'.padEnd(6)} ${'Monto'.padStart(12)} ${'Estado Pago'.padEnd(12)} Proveedor`);
    console.log(`${'─'.repeat(80)}`);
    for (const dte of noMatch) {
      console.log(
        `${String(dte.folio).padEnd(12)} ${String(dte.type).padEnd(6)} ${('$' + dte.totalAmount.toLocaleString('es-CL')).padStart(12)} ${dte.paymentStatus.padEnd(12)} ${dte.provider?.name || dte.rutIssuer}`
      );
    }
  }

  if (withDraftMatch.length > 0) {
    console.log(`\n📋 DTEs CON MATCH DRAFT (pendiente confirmar) (${withDraftMatch.length}):`);
    console.log(`${'Folio'.padEnd(12)} ${'Tipo'.padEnd(6)} ${'Monto'.padStart(12)} ${'Confianza'.padEnd(10)} Proveedor`);
    console.log(`${'─'.repeat(80)}`);
    for (const dte of withDraftMatch) {
      const draft = dte.matches.find(m => m.status === 'DRAFT');
      console.log(
        `${String(dte.folio).padEnd(12)} ${String(dte.type).padEnd(6)} ${('$' + dte.totalAmount.toLocaleString('es-CL')).padStart(12)} ${(draft?.confidence?.toFixed(2) || '?').padEnd(10)} ${dte.provider?.name || dte.rutIssuer}`
      );
    }
  }

  if (withRejectedMatch.length > 0) {
    console.log(`\n❌ DTEs CON MATCH REJECTED (${withRejectedMatch.length}):`);
    for (const dte of withRejectedMatch) {
      console.log(`  Folio ${dte.folio} (Tipo ${dte.type}) - $${dte.totalAmount.toLocaleString('es-CL')} - ${dte.provider?.name || dte.rutIssuer}`);
    }
  }

  if (notFound.length > 0) {
    console.log(`\n🔍 FOLIOS NO ENCONTRADOS EN ENERO 2026 (${notFound.length}):`);
    // Buscar si existen en otros meses
    const existElsewhere = await prisma.dTE.findMany({
      where: { folio: { in: notFound } },
      select: { folio: true, issuedDate: true, type: true, totalAmount: true, provider: { select: { name: true } } },
      orderBy: { folio: 'asc' },
    });
    
    const elsewhereMap = new Map<number, typeof existElsewhere>();
    for (const d of existElsewhere) {
      if (!elsewhereMap.has(d.folio)) elsewhereMap.set(d.folio, []);
      elsewhereMap.get(d.folio)!.push(d);
    }

    for (const f of notFound.sort((a, b) => a - b)) {
      const elsewhere = elsewhereMap.get(f);
      if (elsewhere && elsewhere.length > 0) {
        const info = elsewhere.map(e => `${e.issuedDate.toISOString().split('T')[0]} (Tipo ${e.type})`).join(', ');
        console.log(`  Folio ${f} → Existe pero en otra fecha: ${info}`);
      } else {
        console.log(`  Folio ${f} → No existe en la BD`);
      }
    }
  }

  // Detalle de matches confirmados (para verificar)
  console.log(`\n\n✅ DTEs CON MATCH CONFIRMED (${withConfirmedMatch.length}):`);
  console.log(`${'Folio'.padEnd(12)} ${'Tipo'.padEnd(6)} ${'Monto'.padStart(12)} ${'Origen'.padEnd(10)} ${'Regla'.padEnd(20)} Proveedor`);
  console.log(`${'─'.repeat(100)}`);
  for (const dte of withConfirmedMatch) {
    const confirmed = dte.matches.find(m => m.status === 'CONFIRMED');
    console.log(
      `${String(dte.folio).padEnd(12)} ${String(dte.type).padEnd(6)} ${('$' + dte.totalAmount.toLocaleString('es-CL')).padStart(12)} ${(confirmed?.origin || '?').padEnd(10)} ${(confirmed?.ruleApplied || '?').padEnd(20)} ${dte.provider?.name || dte.rutIssuer}`
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
