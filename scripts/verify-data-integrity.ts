/**
 * Script de Verificación de Integridad de Datos — Organización Bravium
 * 
 * Verifica que:
 * 1. No se hayan perdido matches (reconciliation_matches)
 * 2. No se hayan perdido transacciones (bank_transactions)
 * 3. No se hayan perdido DTEs
 * 4. Consistencia entre matches y estados de TX/DTE
 * 5. No haya matches huérfanos (sin TX o sin DTE)
 * 6. No haya duplicados de matches
 * 7. No haya transacciones MATCHED sin match real
 * 
 * Uso: npx ts-node scripts/verify-data-integrity.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('='.repeat(80));
    console.log('  🔍 VERIFICACIÓN DE INTEGRIDAD DE DATOS — BRAVIUM');
    console.log('  Fecha:', new Date().toISOString());
    console.log('='.repeat(80));
    console.log('');

    // 1. Obtener la organización Bravium
    const orgs = await prisma.organization.findMany({
        select: { id: true, name: true }
    });
    console.log(`📊 Organizaciones en BD: ${orgs.length}`);
    orgs.forEach(o => console.log(`   - ${o.name} (${o.id})`));
    console.log('');

    for (const org of orgs) {
        console.log('─'.repeat(80));
        console.log(`  🏢 Organización: ${org.name} (${org.id})`);
        console.log('─'.repeat(80));

        // 2. Conteo de entidades principales
        const txCount = await prisma.bankTransaction.count({
            where: { bankAccount: { organizationId: org.id } }
        });
        const txByStatus = await prisma.bankTransaction.groupBy({
            by: ['status'],
            where: { bankAccount: { organizationId: org.id } },
            _count: true
        });

        const dteCount = await prisma.dTE.count({
            where: { organizationId: org.id }
        });
        const dteByPayment = await prisma.dTE.groupBy({
            by: ['paymentStatus'],
            where: { organizationId: org.id },
            _count: true
        });

        const matchCount = await prisma.reconciliationMatch.count({
            where: { organizationId: org.id }
        });
        const matchByStatus = await prisma.reconciliationMatch.groupBy({
            by: ['status'],
            where: { organizationId: org.id },
            _count: true
        });

        const suggestionCount = await prisma.matchSuggestion.count({
            where: { organizationId: org.id }
        });
        const suggByStatus = await prisma.matchSuggestion.groupBy({
            by: ['status'],
            where: { organizationId: org.id },
            _count: true
        });

        const providerCount = await prisma.provider.count({
            where: { organizationId: org.id }
        });

        const bankAccounts = await prisma.bankAccount.count({
            where: { organizationId: org.id }
        });

        console.log('');
        console.log('  📋 CONTEO DE ENTIDADES:');
        console.log(`     Cuentas bancarias:  ${bankAccounts}`);
        console.log(`     Transacciones:      ${txCount}`);
        txByStatus.forEach(s => console.log(`       └─ ${s.status}: ${s._count}`));
        console.log(`     DTEs:               ${dteCount}`);
        dteByPayment.forEach(s => console.log(`       └─ ${s.paymentStatus}: ${s._count}`));
        console.log(`     Matches:            ${matchCount}`);
        matchByStatus.forEach(s => console.log(`       └─ ${s.status}: ${s._count}`));
        console.log(`     Sugerencias:        ${suggestionCount}`);
        suggByStatus.forEach(s => console.log(`       └─ ${s.status}: ${s._count}`));
        console.log(`     Proveedores:        ${providerCount}`);
        console.log('');

        // 3. Verificar integridad con raw queries
        console.log('  🔎 VERIFICACIÓN DE INTEGRIDAD:');

        // Matches sin DTE (campo opcional)
        const orphanedMatchesNoDte = await prisma.reconciliationMatch.count({
            where: {
                organizationId: org.id,
                dteId: null,
                paymentId: null
            }
        });
        
        if (orphanedMatchesNoDte > 0) {
            console.log(`     ⚠️  Matches SIN DTE ni payment: ${orphanedMatchesNoDte}`);
        } else {
            console.log(`     ✅ Todos los matches tienen DTE o payment vinculado`);
        }

        // TX MATCHED sin match activo (usando raw query)
        const txMatchedWithoutMatch = await prisma.$queryRaw<any[]>`
            SELECT COUNT(*) as count FROM bank_transactions bt
            JOIN bank_accounts ba ON bt."bankAccountId" = ba.id
            WHERE ba."organizationId" = ${org.id}
              AND bt.status = 'MATCHED'
              AND NOT EXISTS (
                SELECT 1 FROM reconciliation_matches rm
                WHERE rm."transactionId" = bt.id
                  AND rm.status != 'REJECTED'
              )
        `;
        const ghostMatched = Number(txMatchedWithoutMatch[0]?.count || 0);

        if (ghostMatched > 0) {
            console.log(`     ⚠️  TX marcadas MATCHED pero SIN match activo: ${ghostMatched}`);
        } else {
            console.log(`     ✅ Todas las TX MATCHED tienen al menos un match activo`);
        }

        // DTEs PAID sin match (info, pueden ser marcadas manualmente)
        const dtePaidNoMatch = await prisma.$queryRaw<any[]>`
            SELECT COUNT(*) as count FROM dtes d
            WHERE d."organizationId" = ${org.id}
              AND d."paymentStatus" = 'PAID'
              AND NOT EXISTS (
                SELECT 1 FROM reconciliation_matches rm
                WHERE rm."dteId" = d.id
                  AND rm.status != 'REJECTED'
              )
        `;
        const paidNoMatch = Number(dtePaidNoMatch[0]?.count || 0);
        console.log(`     ℹ️  DTEs PAID sin match (marcadas manualmente): ${paidNoMatch}`);

        // Duplicados
        const duplicateMatches = await prisma.$queryRaw<any[]>`
            SELECT "transactionId", "dteId", COUNT(*) as count
            FROM reconciliation_matches
            WHERE "organizationId" = ${org.id}
              AND status != 'REJECTED'
              AND "dteId" IS NOT NULL
            GROUP BY "transactionId", "dteId"
            HAVING COUNT(*) > 1
        `;

        if (duplicateMatches.length > 0) {
            console.log(`     ⚠️  Pares TX-DTE con matches DUPLICADOS: ${duplicateMatches.length}`);
        } else {
            console.log(`     ✅ Sin matches duplicados`);
        }

        // 7. Montos totales (para verificar que no se perdieron datos)
        const txTotalAmount = await prisma.bankTransaction.aggregate({
            where: { bankAccount: { organizationId: org.id } },
            _sum: { amount: true },
            _count: true
        });
        
        const dteTotalAmount = await prisma.dTE.aggregate({
            where: { organizationId: org.id },
            _sum: { totalAmount: true },
            _count: true
        });

        console.log('');
        console.log('  💰 MONTOS TOTALES (checksum):');
        console.log(`     TX total: $${Number(txTotalAmount._sum.amount || 0).toLocaleString('es-CL')} (${txTotalAmount._count} registros)`);
        console.log(`     DTE total: $${Number(dteTotalAmount._sum.totalAmount || 0).toLocaleString('es-CL')} (${dteTotalAmount._count} registros)`);

        // 8. Matches por mes (2026)
        const matchesByMonth = await prisma.$queryRaw<any[]>`
            SELECT 
                TO_CHAR("createdAt", 'YYYY-MM') as month,
                COUNT(*) as count,
                COUNT(CASE WHEN "status" = 'CONFIRMED' THEN 1 END) as confirmed,
                COUNT(CASE WHEN "status" = 'DRAFT' THEN 1 END) as draft
            FROM reconciliation_matches
            WHERE "organizationId" = ${org.id}
            GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
            ORDER BY month
        `;

        if (matchesByMonth.length > 0) {
            console.log('');
            console.log('  📅 MATCHES POR MES:');
            matchesByMonth.forEach(m => {
                console.log(`     ${m.month}: ${m.count} total (${m.confirmed} confirmed, ${m.draft} draft)`);
            });
        }

        // 9. Transacciones por mes
        const txByMonth = await prisma.$queryRaw<any[]>`
            SELECT 
                TO_CHAR(bt."date", 'YYYY-MM') as month,
                COUNT(*) as count,
                COUNT(CASE WHEN bt."status" = 'MATCHED' THEN 1 END) as matched,
                COUNT(CASE WHEN bt."status" = 'PENDING' THEN 1 END) as pending
            FROM bank_transactions bt
            JOIN bank_accounts ba ON bt."bankAccountId" = ba.id
            WHERE ba."organizationId" = ${org.id}
            GROUP BY TO_CHAR(bt."date", 'YYYY-MM')
            ORDER BY month DESC
            LIMIT 12
        `;

        if (txByMonth.length > 0) {
            console.log('');
            console.log('  📅 TRANSACCIONES POR MES (últimos 12):');
            txByMonth.forEach(m => {
                console.log(`     ${m.month}: ${m.count} total (${m.matched} matched, ${m.pending} pending)`);
            });
        }

        console.log('');
    }

    // 10. Verificación cross-tenant
    console.log('─'.repeat(80));
    console.log('  🔒 VERIFICACIÓN CROSS-TENANT');
    console.log('─'.repeat(80));

    const matchesWithoutOrg = await prisma.reconciliationMatch.count({
        where: { organizationId: null as any }
    });
    if (matchesWithoutOrg > 0) {
        console.log(`  ⚠️  Matches SIN organizationId: ${matchesWithoutOrg}`);
    } else {
        console.log(`  ✅ Todos los matches tienen organizationId asignado`);
    }

    const dtesWithoutOrg = await prisma.dTE.count({
        where: { organizationId: null as any }
    });
    if (dtesWithoutOrg > 0) {
        console.log(`  ⚠️  DTEs SIN organizationId: ${dtesWithoutOrg}`);
    } else {
        console.log(`  ✅ Todas las DTEs tienen organizationId asignado`);
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('  ✅ VERIFICACIÓN COMPLETADA');
    console.log('='.repeat(80));
}

main()
    .catch(err => {
        console.error('❌ Error en verificación:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
