/**
 * run_full_reconciliation.ts
 * ──────────────────────────
 * Wrapper CLI del motor canónico de conciliación.
 * Toda la lógica está en: src/modules/conciliacion/engine/reconciliation.engine.ts
 *
 * Uso:
 *   npx tsx scripts/run_full_reconciliation.ts           # LIVE
 *   npx tsx scripts/run_full_reconciliation.ts --dry-run  # Simulación
 */

import { PrismaClient } from '@prisma/client';
import { ReconciliationEngine } from '../src/modules/conciliacion/engine/reconciliation.engine';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log(`  MOTOR DE CONCILIACIÓN ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
    console.log('  Fecha:', new Date().toISOString());
    console.log('='.repeat(70) + '\n');

    const org = await prisma.organization.findFirst({
        where: { isActive: true },
    });
    if (!org) throw new Error('No se encontró organización activa.');
    console.log(`📌 Organización: ${org.name}\n`);

    const engine = new ReconciliationEngine(prisma);
    const result = await engine.run({
        organizationId: org.id,
        dryRun: DRY_RUN,
        lookbackDays: 120,
        amountTolerance: 1000,
        dateWindowDays: 90,
    });

    console.log('\n' + '='.repeat(70));
    console.log('  RESUMEN CONCILIACIÓN');
    console.log('='.repeat(70));
    console.log(`  📋 Procesadas:          ${result.processed}`);
    console.log(`  ─────────────────────────────────────────────`);
    console.log(`  ✅ P0  RUT-First:       ${result.pass0Rut}`);
    console.log(`  ✅ P1  Monto Exacto:    ${result.pass1Exact}`);
    console.log(`  ✅ P2  RUT+Monto:       ${result.pass2RutAmount}`);
    console.log(`  ✅ P3  Alias:           ${result.pass3Alias}`);
    console.log(`  ✅ P4  Fuzzy Nombre:    ${result.pass4Fuzzy}`);
    console.log(`  💡 P5  SUM N:1:         ${result.pass5Sum}`);
    console.log(`  💡 P6  SPLIT 1:N:       ${result.pass6Split}`);
    console.log(`  ─────────────────────────────────────────────`);
    console.log(`  ✅ Total DRAFTs:        ${result.totalDrafts}`);
    console.log(`  💡 Total sugerencias:  ${result.totalSuggestions}`);
    console.log(`  ⏳ Sin match:           ${result.stillPending}`);
    console.log('='.repeat(70) + '\n');
}

main().catch(console.error).finally(() => prisma.$disconnect());
