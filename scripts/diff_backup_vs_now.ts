/**
 * diff_backup_vs_now.ts
 * Compara el estado de conciliación antes del motor canónico vs ahora.
 * "Antes" = matches con reglas del sistema legacy (sin prefijo [P0]-[P6])
 * "Ahora" = total actual incluyendo matches del nuevo motor
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
    const org = await p.organization.findFirst({ where: { isActive: true } });
    const orgId = org!.id;

    // ── Todos los matches 2026 ─────────────────────────────────────────────
    const allMatches = await p.reconciliationMatch.findMany({
        where: { organizationId: orgId },
        select: { id: true, status: true, ruleApplied: true, createdAt: true, confidence: true },
        orderBy: { createdAt: 'asc' }
    });

    // Clasificar: "legacy" = antes del motor canónico (commit 962632f, ~13 mayo)
    // vs "nuevo" = generados por [P0]-[P6]
    const cutoffDate = new Date('2026-05-13T00:00:00Z'); // dia del refactor

    const legacy = allMatches.filter(m => m.createdAt < cutoffDate);
    const nuevos = allMatches.filter(m => m.createdAt >= cutoffDate);

    // Reglas del motor nuevo
    const motorNuevo = allMatches.filter(m => /^\[P[0-6]/.test(m.ruleApplied || ''));
    const motorLegacy = allMatches.filter(m => !/^\[P[0-6]/.test(m.ruleApplied || ''));

    console.log(`\n${'═'.repeat(62)}`);
    console.log(`  DIFERENCIA: BACKUP (b21013a) vs ESTADO ACTUAL`);
    console.log(`${'═'.repeat(62)}\n`);

    console.log(`BACKUP (antes del motor canónico, 11 abril 2026):`);
    const legacyConfirmed = motorLegacy.filter(m => m.status === 'CONFIRMED').length;
    const legacyDraft = motorLegacy.filter(m => m.status === 'DRAFT').length;
    console.log(`  CONFIRMED: ${legacyConfirmed}`);
    console.log(`  DRAFT:     ${legacyDraft}`);
    console.log(`  Total:     ${legacyConfirmed + legacyDraft}`);

    console.log(`\nESTADO ACTUAL (motor canónico [P0]-[P6]):`);
    const nuevoConfirmed = motorNuevo.filter(m => m.status === 'CONFIRMED').length;
    const nuevoDraft = motorNuevo.filter(m => m.status === 'DRAFT').length;
    console.log(`  CONFIRMED: ${nuevoConfirmed}`);
    console.log(`  DRAFT:     ${nuevoDraft}`);
    console.log(`  Total:     ${nuevoConfirmed + nuevoDraft}`);

    console.log(`\nTOTAL EN BD HOY:`);
    const totalConfirmed = allMatches.filter(m => m.status === 'CONFIRMED').length;
    const totalDraft = allMatches.filter(m => m.status === 'DRAFT').length;
    const totalRejected = allMatches.filter(m => m.status === 'REJECTED').length;
    console.log(`  CONFIRMED: ${totalConfirmed}`);
    console.log(`  DRAFT:     ${totalDraft}`);
    console.log(`  REJECTED:  ${totalRejected}`);
    console.log(`  Total:     ${totalConfirmed + totalDraft + totalRejected}`);

    // Distribución de reglas legacy
    console.log(`\n── Reglas legacy (top 10) ──`);
    const legacyRules: Record<string, number> = {};
    for (const m of motorLegacy) {
        const r = (m.ruleApplied || 'unknown').slice(0, 25);
        legacyRules[r] = (legacyRules[r] || 0) + 1;
    }
    for (const [r, c] of Object.entries(legacyRules).sort((a,b) => b[1]-a[1]).slice(0,10))
        console.log(`  ${r.padEnd(28)}: ${c}`);

    // Distribución de reglas nuevas
    console.log(`\n── Reglas motor canónico ──`);
    const newRules: Record<string, number> = {};
    for (const m of motorNuevo) {
        const r = (m.ruleApplied || 'unknown').slice(0, 25);
        newRules[r] = (newRules[r] || 0) + 1;
    }
    for (const [r, c] of Object.entries(newRules).sort((a,b) => b[1]-a[1]))
        console.log(`  ${r.padEnd(28)}: ${c}`);

    // TXs por estado
    console.log(`\n── Estado actual TXs 2026 ──`);
    const txStats = await p.bankTransaction.groupBy({
        by: ['status'],
        where: { bankAccount: { organizationId: orgId }, type: 'DEBIT', date: { gte: new Date('2026-01-01') } },
        _count: true,
        _sum: { amount: true }
    });
    for (const s of txStats.sort((a,b) => b._count - a._count)) {
        const sum = Math.abs(s._sum.amount || 0);
        console.log(`  ${s.status.padEnd(20)}: ${String(s._count).padStart(4)} TXs  $${sum.toLocaleString('es-CL').padStart(18)}`);
    }

    // Sugerencias
    console.log(`\n── Sugerencias pendientes ──`);
    const sug = await p.matchSuggestion.groupBy({ by: ['status', 'type'], where: { organizationId: orgId }, _count: true });
    for (const s of sug.filter(s => s.status === 'PENDING'))
        console.log(`  ${s.type} PENDING: ${s._count}`);

    console.log(`\n${'─'.repeat(62)}`);
    const diff = (totalConfirmed + totalDraft) - (legacyConfirmed + legacyDraft);
    console.log(`  📊 Diferencia neta vs backup: ${diff > 0 ? '+' : ''}${diff} matches`);
    console.log(`  (${legacyConfirmed + legacyDraft} backup → ${totalConfirmed + totalDraft} ahora)`);
    console.log(`${'═'.repeat(62)}\n`);
}

main().catch(console.error).finally(() => p.$disconnect());
