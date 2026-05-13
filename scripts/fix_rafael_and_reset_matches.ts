/**
 * fix_rafael_and_reset_matches.ts
 * 1. Actualiza RUT real de Rafael Fuentes en BD
 * 2. Crea ProviderAlias para sus patrones de TX
 * 3. Limpia todos los DRAFT matches
 * 4. Re-ejecuta el motor canónico
 */
import { PrismaClient } from '@prisma/client';
import { ReconciliationEngine } from '../src/modules/conciliacion/engine/reconciliation.engine';

const p = new PrismaClient();

async function main() {
    console.log('=== FIX RAFAEL + RESET MATCHES ===\n');

    // ─── 1. Arreglar RUT de Rafael Fuentes ────────────────────────────────
    console.log('1. Actualizando RUT de Rafael Fuentes...');
    const rafaelRutReal = '16.751.160-0';
    const rafaelRutClean = '16751160-0';

    const prov = await p.provider.findFirst({
        where: { name: { contains: 'Rafael', mode: 'insensitive' } }
    });

    if (!prov) {
        console.log('   ❌ Proveedor Rafael no encontrado');
    } else {
        await p.provider.update({
            where: { id: prov.id },
            data: { rut: rafaelRutReal }
        });
        console.log(`   ✅ RUT actualizado: ${prov.rut} → ${rafaelRutReal}`);

        // ─── 2. Arreglar providerRut en metadata de sus TXs ─────────────────
        console.log('\n2. Actualizando metadata.providerRut en sus transacciones...');
        const rafaelTxs = await p.bankTransaction.findMany({
            where: { description: { contains: '0167511600', mode: 'insensitive' } },
            select: { id: true, metadata: true, description: true }
        });
        let updatedTxs = 0;
        for (const tx of rafaelTxs) {
            const meta = (tx.metadata as any) || {};
            if (!meta.providerRut) {
                await p.bankTransaction.update({
                    where: { id: tx.id },
                    data: { metadata: { ...meta, providerRut: rafaelRutReal } }
                });
                updatedTxs++;
            }
        }
        console.log(`   ✅ ${updatedTxs} TXs actualizadas con providerRut: ${rafaelRutReal}`);

        // ─── 3. Crear ProviderAliases ────────────────────────────────────────
        console.log('\n3. Creando ProviderAliases para Rafael...');
        const aliases = [
            '0167511600 transf a rafael fuentes',
            'rafael fuentes',
            '0167511600',
        ];
        for (const desc of aliases) {
            const existing = await p.providerAlias.findFirst({
                where: { description: { equals: desc, mode: 'insensitive' }, providerId: prov.id }
            });
            if (!existing) {
                await p.providerAlias.create({
                    data: { description: desc, providerId: prov.id }
                });
                console.log(`   ✅ Alias creado: "${desc}"`);
            } else {
                console.log(`   ⏭  Alias ya existe: "${desc}"`);
            }
        }
    }

    // ─── 4. Limpiar todos los DRAFTs ─────────────────────────────────────────
    console.log('\n4. Limpiando DRAFT matches existentes...');
    const deleted = await p.reconciliationMatch.deleteMany({ where: { status: 'DRAFT' } });
    console.log(`   ✅ ${deleted.count} DRAFTs eliminados`);

    // Reset TXs a PENDING (las que no tienen CONFIRMED)
    const confirmedTxIds = await p.reconciliationMatch.findMany({
        where: { status: 'CONFIRMED' },
        select: { transactionId: true }
    });
    const confirmedIds = new Set(confirmedTxIds.map(m => m.transactionId));

    const resetResult = await p.bankTransaction.updateMany({
        where: {
            status: 'PARTIALLY_MATCHED',
            id: { notIn: [...confirmedIds] }
        },
        data: { status: 'PENDING' }
    });
    console.log(`   ✅ ${resetResult.count} TXs reseteadas a PENDING`);

    // ─── 5. Re-ejecutar motor canónico ───────────────────────────────────────
    console.log('\n5. Ejecutando motor canónico...');
    const org = await p.organization.findFirst({ where: { isActive: true } });
    if (!org) throw new Error('No hay organización activa');

    const engine = new ReconciliationEngine(p);
    const result = await engine.run({
        organizationId: org.id,
        dryRun: false,
        lookbackDays: 120,
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
    console.log(`  💡 P5  SUM N:1:     ${result.pass5Sum}`);
    console.log(`  💡 P6  SPLIT 1:N:   ${result.pass6Split}`);
    console.log(`  ─────────────────────────────────`);
    console.log(`  ✅ Total DRAFTs:    ${result.totalDrafts}`);
    console.log(`  💡 Total suger.:    ${result.totalSuggestions}`);
    console.log(`  ⏳ Sin match:       ${result.stillPending}`);
}

main().catch(console.error).finally(() => p.$disconnect());
