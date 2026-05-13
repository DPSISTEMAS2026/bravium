/**
 * reset_and_rerun.ts
 * Limpia DRAFTs, resetea solo PARTIALLY_MATCHED y re-ejecuta el motor (desde 2026-01-01).
 * NO toca UNMATCHED — esas fueron revisadas manualmente y no deben volver al motor.
 */
import { PrismaClient } from '@prisma/client';
import { ReconciliationEngine } from '../src/modules/conciliacion/engine/reconciliation.engine';

const p = new PrismaClient();

async function main() {
    console.log('=== RESET + RE-RUN (2026) ===\n');
    const org = await p.organization.findFirst({ where: { isActive: true } });
    if (!org) throw new Error('No hay organización activa');

    // 1. Eliminar DRAFTs
    const deleted = await p.reconciliationMatch.deleteMany({ where: { status: 'DRAFT', organizationId: org.id } });
    console.log(`✅ ${deleted.count} DRAFTs eliminados`);

    // 2. Reset SOLO PARTIALLY_MATCHED → PENDING (NO tocar UNMATCHED: tienen anotación manual)
    const resetPartial = await p.bankTransaction.updateMany({
        where: { status: 'PARTIALLY_MATCHED', bankAccount: { organizationId: org.id } },
        data: { status: 'PENDING' }
    });
    console.log(`✅ Reset: ${resetPartial.count} PARTIALLY_MATCHED → PENDING`);
    console.log(`   (UNMATCHED no se tocan — tienen anotación manual)`);

    // 3. Ejecutar motor (desde 2026-01-01, fijo en el engine)
    console.log('\nEjecutando motor canónico (desde 2026-01-01)...');
    const engine = new ReconciliationEngine(p);
    const result = await engine.run({
        organizationId: org.id,
        dryRun: false,
        amountTolerance: 1000,
        dateWindowDays: 90,
    });

    console.log('\n=== RESUMEN ===');
    console.log(`  📋 TXs procesadas: ${result.processed}`);
    console.log(`  ✅ P0  RUT-First:   ${result.pass0Rut}`);
    console.log(`  ✅ P1  Monto Exacto: ${result.pass1Exact}`);
    console.log(`  ✅ P2  RUT+Monto:   ${result.pass2RutAmount}`);
    console.log(`  ✅ P3  Alias:        ${result.pass3Alias}`);
    console.log(`  ✅ P4  FuzzyName:   ${result.pass4Fuzzy}`);
    console.log(`  💡 P5  SUM N:M:     ${result.pass5Sum}`);
    console.log(`  💡 P6  SPLIT 1:N:   ${result.pass6Split}`);
    console.log(`  ─────────────────────────────────`);
    console.log(`  ✅ Total DRAFTs:    ${result.totalDrafts}`);
    console.log(`  💡 Total suger.:    ${result.totalSuggestions}`);
    console.log(`  ⏳ Sin match:       ${result.stillPending}`);
}

main().catch(console.error).finally(() => p.$disconnect());
