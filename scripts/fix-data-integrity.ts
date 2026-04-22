/**
 * Script de Reparación de Integridad de Datos — Bravium
 * 
 * Corrige:
 * 1. Matches sin organizationId → asignar basándose en la TX asociada
 * 2. TX fantasma (MATCHED sin match activo) → revertir a PENDING
 * 3. Matches duplicados → eliminar duplicados conservando el más antiguo
 * 
 * Uso: npx ts-node scripts/fix-data-integrity.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('='.repeat(80));
    console.log('  🔧 REPARACIÓN DE INTEGRIDAD DE DATOS — BRAVIUM');
    console.log('  Fecha:', new Date().toISOString());
    console.log('='.repeat(80));
    console.log('');

    // ──────────────────────────────────────────────────────────────────────
    // 1. FIX: Matches sin organizationId
    // ──────────────────────────────────────────────────────────────────────
    console.log('1️⃣  Corrigiendo matches sin organizationId...');
    
    const orphanMatches = await prisma.reconciliationMatch.findMany({
        where: { organizationId: '' },
        include: {
            transaction: {
                include: { bankAccount: true }
            }
        }
    });

    // También buscar con null real usando raw query
    const nullOrgMatches = await prisma.$queryRaw<any[]>`
        SELECT rm.id, rm."transactionId", ba."organizationId"
        FROM reconciliation_matches rm
        JOIN bank_transactions bt ON rm."transactionId" = bt.id
        JOIN bank_accounts ba ON bt."bankAccountId" = ba.id
        WHERE rm."organizationId" IS NULL OR rm."organizationId" = ''
    `;

    if (nullOrgMatches.length > 0) {
        console.log(`   Encontrados ${nullOrgMatches.length} matches sin org → asignando desde TX...`);
        
        for (const match of nullOrgMatches) {
            if (match.organizationId) {
                await prisma.reconciliationMatch.update({
                    where: { id: match.id },
                    data: { organizationId: match.organizationId }
                });
            }
        }
        console.log(`   ✅ ${nullOrgMatches.length} matches reparados`);
    } else {
        // Intentar con otra query por si el campo no es null sino vacío
        const emptyOrgCount = await prisma.$queryRaw<any[]>`
            SELECT COUNT(*) as count FROM reconciliation_matches WHERE "organizationId" IS NULL
        `;
        const count = Number(emptyOrgCount[0]?.count || 0);
        if (count > 0) {
            console.log(`   Encontrados ${count} matches con organizationId NULL...`);
            
            // Asignar org desde la TX
            const updated = await prisma.$executeRaw`
                UPDATE reconciliation_matches rm
                SET "organizationId" = ba."organizationId"
                FROM bank_transactions bt
                JOIN bank_accounts ba ON bt."bankAccountId" = ba.id
                WHERE rm."transactionId" = bt.id
                  AND rm."organizationId" IS NULL
            `;
            console.log(`   ✅ ${updated} matches reparados`);
        } else {
            console.log('   ℹ️  No se encontraron matches sin org (ya corregidos)');
        }
    }
    console.log('');

    // ──────────────────────────────────────────────────────────────────────
    // 2. FIX: TX fantasma (MATCHED sin match activo)
    // ──────────────────────────────────────────────────────────────────────
    console.log('2️⃣  Corrigiendo TX fantasma (MATCHED sin match)...');
    
    const ghostTxs = await prisma.$queryRaw<any[]>`
        SELECT bt.id, bt.description, bt.amount, bt.date
        FROM bank_transactions bt
        WHERE bt.status = 'MATCHED'
          AND NOT EXISTS (
            SELECT 1 FROM reconciliation_matches rm
            WHERE rm."transactionId" = bt.id
              AND rm.status != 'REJECTED'
          )
    `;

    if (ghostTxs.length > 0) {
        console.log(`   Encontradas ${ghostTxs.length} TX fantasma → revertiendo a PENDING...`);
        
        const ghostIds = ghostTxs.map(tx => tx.id);
        const updated = await prisma.bankTransaction.updateMany({
            where: { id: { in: ghostIds } },
            data: { status: 'PENDING' }
        });
        
        console.log(`   ✅ ${updated.count} TX revertidas a PENDING`);
        // Mostrar las primeras 5
        ghostTxs.slice(0, 5).forEach(tx => {
            console.log(`      - ${tx.description?.slice(0, 50)} | $${tx.amount} | ${tx.date?.toISOString?.()?.split('T')[0] || tx.date}`);
        });
        if (ghostTxs.length > 5) console.log(`      ... y ${ghostTxs.length - 5} más`);
    } else {
        console.log('   ℹ️  No hay TX fantasma');
    }
    console.log('');

    // ──────────────────────────────────────────────────────────────────────
    // 3. FIX: Matches duplicados (misma TX + mismo DTE)
    // ──────────────────────────────────────────────────────────────────────
    console.log('3️⃣  Limpiando matches duplicados...');
    
    const duplicatePairs = await prisma.$queryRaw<any[]>`
        SELECT "transactionId", "dteId", COUNT(*) as count,
               array_agg(id ORDER BY "createdAt" ASC) as match_ids
        FROM reconciliation_matches
        WHERE status != 'REJECTED'
          AND "dteId" IS NOT NULL
        GROUP BY "transactionId", "dteId"
        HAVING COUNT(*) > 1
    `;

    if (duplicatePairs.length > 0) {
        console.log(`   Encontrados ${duplicatePairs.length} pares duplicados...`);
        let totalDeleted = 0;
        
        for (const pair of duplicatePairs) {
            const ids: string[] = pair.match_ids;
            // Conservar el primero (más antiguo), eliminar los demás
            const idsToDelete = ids.slice(1);
            
            await prisma.reconciliationMatch.deleteMany({
                where: { id: { in: idsToDelete } }
            });
            totalDeleted += idsToDelete.length;
        }
        
        console.log(`   ✅ ${totalDeleted} matches duplicados eliminados (se conservó el más antiguo de cada par)`);
    } else {
        console.log('   ℹ️  No hay matches duplicados');
    }
    console.log('');

    // ──────────────────────────────────────────────────────────────────────
    // Verificación post-fix
    // ──────────────────────────────────────────────────────────────────────
    console.log('─'.repeat(80));
    console.log('  📊 VERIFICACIÓN POST-FIX');
    console.log('─'.repeat(80));

    const finalMatchCount = await prisma.reconciliationMatch.count();
    const finalConfirmed = await prisma.reconciliationMatch.count({ where: { status: 'CONFIRMED' } });
    const finalDraft = await prisma.reconciliationMatch.count({ where: { status: 'DRAFT' } });
    const finalTxMatched = await prisma.bankTransaction.count({ where: { status: 'MATCHED' } });
    const finalTxPending = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });

    const remainingNullOrg = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count FROM reconciliation_matches WHERE "organizationId" IS NULL
    `;
    const remainingGhosts = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count FROM bank_transactions bt
        WHERE bt.status = 'MATCHED'
          AND NOT EXISTS (
            SELECT 1 FROM reconciliation_matches rm
            WHERE rm."transactionId" = bt.id AND rm.status != 'REJECTED'
          )
    `;
    const remainingDups = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count FROM (
            SELECT "transactionId", "dteId"
            FROM reconciliation_matches
            WHERE status != 'REJECTED' AND "dteId" IS NOT NULL
            GROUP BY "transactionId", "dteId"
            HAVING COUNT(*) > 1
        ) sub
    `;

    console.log(`  Matches totales:   ${finalMatchCount} (${finalConfirmed} confirmed, ${finalDraft} draft)`);
    console.log(`  TX MATCHED:        ${finalTxMatched}`);
    console.log(`  TX PENDING:        ${finalTxPending}`);
    console.log(`  Org NULL:          ${remainingNullOrg[0]?.count || 0}`);
    console.log(`  TX fantasma:       ${remainingGhosts[0]?.count || 0}`);
    console.log(`  Pares duplicados:  ${remainingDups[0]?.count || 0}`);
    console.log('');
    console.log('='.repeat(80));
    console.log('  ✅ REPARACIÓN COMPLETADA');
    console.log('='.repeat(80));
}

main()
    .catch(err => {
        console.error('❌ Error en reparación:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
