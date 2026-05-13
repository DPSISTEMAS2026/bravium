/**
 * Análisis detallado: Backup (16 Abr) vs Estado Actual
 * Sin modificar nada, solo comparar números
 */
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BACKUP = 'd:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z';
const ORG = '715545b8-4522-4bb1-be81-3047546c0e8c';

async function main() {
    console.log('='.repeat(80));
    console.log('  📋 COMPARACIÓN BACKUP (16-Abr) vs ACTUAL');
    console.log('='.repeat(80));
    
    // ── Cargar backup ──
    const backupMatches = JSON.parse(fs.readFileSync(`${BACKUP}\\bravium_reconciliation_matches.json`, 'utf8'));
    const backupTxs = JSON.parse(fs.readFileSync(`${BACKUP}\\bravium_santander_cc_transactions.json`, 'utf8'));
    
    console.log('\n  📦 BACKUP (16 Abril 2026)');
    console.log('  ─'.repeat(38));
    
    // TX stats del backup
    const bkTxByStatus: Record<string, number> = {};
    for (const tx of backupTxs) {
        bkTxByStatus[tx.status] = (bkTxByStatus[tx.status] || 0) + 1;
    }
    console.log(`  Transacciones (solo Santander CC): ${backupTxs.length}`);
    for (const [k, v] of Object.entries(bkTxByStatus)) {
        console.log(`    └─ ${k}: ${v}`);
    }
    
    const bkTxMatched = bkTxByStatus['MATCHED'] || 0;
    console.log(`  Tasa conciliación TX: ${((bkTxMatched / backupTxs.length) * 100).toFixed(1)}%`);
    
    // Match stats del backup
    const bkMatchByStatus: Record<string, number> = {};
    for (const m of backupMatches) {
        bkMatchByStatus[m.status] = (bkMatchByStatus[m.status] || 0) + 1;
    }
    console.log(`\n  Matches: ${backupMatches.length}`);
    for (const [k, v] of Object.entries(bkMatchByStatus)) {
        console.log(`    └─ ${k}: ${v}`);
    }
    
    // Matches por origen
    const bkMatchByOrigin: Record<string, number> = {};
    for (const m of backupMatches) {
        bkMatchByOrigin[m.origin] = (bkMatchByOrigin[m.origin] || 0) + 1;
    }
    console.log('  Por origen:');
    for (const [k, v] of Object.entries(bkMatchByOrigin)) {
        console.log(`    └─ ${k}: ${v}`);
    }

    // ── Estado actual de la BD ──
    console.log('\n\n  🔵 ESTADO ACTUAL (Post-Fix)');
    console.log('  ─'.repeat(38));
    
    // TX stats actuales (TODAS las cuentas de Bravium)
    const currentTxs = await prisma.bankTransaction.findMany({
        where: { bankAccount: { organizationId: ORG } },
        select: { id: true, status: true, bankAccountId: true }
    });
    
    const curTxByStatus: Record<string, number> = {};
    const curTxByAccount: Record<string, number> = {};
    for (const tx of currentTxs) {
        curTxByStatus[tx.status] = (curTxByStatus[tx.status] || 0) + 1;
        curTxByAccount[tx.bankAccountId] = (curTxByAccount[tx.bankAccountId] || 0) + 1;
    }
    console.log(`  Transacciones (TODAS cuentas): ${currentTxs.length}`);
    for (const [k, v] of Object.entries(curTxByStatus)) {
        console.log(`    └─ ${k}: ${v}`);
    }
    const curMatched = curTxByStatus['MATCHED'] || 0;
    console.log(`  Tasa conciliación TX: ${((curMatched / currentTxs.length) * 100).toFixed(1)}%`);
    
    // Cuentas bancarias
    const accounts = await prisma.bankAccount.findMany({
        where: { organizationId: ORG },
        select: { id: true, bankName: true, accountNumber: true }
    });
    console.log(`\n  Cuentas bancarias: ${accounts.length}`);
    for (const acc of accounts) {
        const count = curTxByAccount[acc.id] || 0;
        console.log(`    └─ ${acc.bankName} (${acc.accountNumber}): ${count} TX`);
    }
    
    // Match stats actuales
    const currentMatches = await prisma.reconciliationMatch.findMany({
        where: { organizationId: ORG },
        select: { id: true, status: true, origin: true, transactionId: true, dteId: true }
    });
    
    const curMatchByStatus: Record<string, number> = {};
    for (const m of currentMatches) {
        curMatchByStatus[m.status] = (curMatchByStatus[m.status] || 0) + 1;
    }
    console.log(`\n  Matches: ${currentMatches.length}`);
    for (const [k, v] of Object.entries(curMatchByStatus)) {
        console.log(`    └─ ${k}: ${v}`);
    }

    // ── DIFERENCIA: ¿Qué matches del backup NO existen ahora? ──
    console.log('\n\n  🔍 ANÁLISIS DE DIFERENCIAS');
    console.log('  ─'.repeat(38));
    
    const currentMatchIds = new Set(currentMatches.map(m => m.id));
    const currentTxIds = new Set(currentTxs.map(t => t.id));
    const currentMatchedTxIds = new Set(currentMatches.map(m => m.transactionId));
    const currentMatchedDteIds = new Set(currentMatches.filter(m => m.dteId).map(m => m.dteId));
    
    // Matches del backup que ya no existen
    const missingMatches = backupMatches.filter((m: any) => !currentMatchIds.has(m.id));
    const missingConfirmed = missingMatches.filter((m: any) => m.status === 'CONFIRMED');
    const missingDraft = missingMatches.filter((m: any) => m.status === 'DRAFT');
    
    console.log(`  Matches del backup que NO existen ahora: ${missingMatches.length}`);
    console.log(`    └─ CONFIRMED: ${missingConfirmed.length}`);
    console.log(`    └─ DRAFT: ${missingDraft.length}`);
    
    // ¿Las TX de esos matches missing aún existen?
    let missingTxStillExist = 0;
    let missingTxGone = 0;
    let missingDteStillMatched = 0;
    
    for (const m of missingConfirmed) {
        if (currentTxIds.has(m.transactionId)) {
            missingTxStillExist++;
        } else {
            missingTxGone++;
        }
        if (m.dteId && currentMatchedDteIds.has(m.dteId)) {
            missingDteStillMatched++;
        }
    }
    
    console.log(`\n  De los ${missingConfirmed.length} matches CONFIRMED perdidos:`);
    console.log(`    └─ TX aún existe en BD: ${missingTxStillExist}`);
    console.log(`    └─ TX ya no existe: ${missingTxGone}`);
    console.log(`    └─ DTE ya re-matcheada por otro: ${missingDteStillMatched}`);
    console.log(`    └─ Realmente perdidos (TX existe, DTE no re-matcheada): ${missingTxStillExist - missingDteStillMatched}`);

    // TX del backup que estaban MATCHED y ahora no lo están
    const backupMatchedTxIds = new Set(
        backupTxs.filter((t: any) => t.status === 'MATCHED').map((t: any) => t.id)
    );
    
    let nowPendingWasMatched = 0;
    for (const txId of backupMatchedTxIds) {
        const current = currentTxs.find(t => t.id === txId);
        if (current && current.status !== 'MATCHED') {
            nowPendingWasMatched++;
        }
    }
    console.log(`\n  TX que estaban MATCHED en backup y ahora NO lo están: ${nowPendingWasMatched}`);

    // Resumen del impacto
    console.log('\n\n  📊 RESUMEN DE IMPACTO');
    console.log('  ═'.repeat(38));
    console.log(`  Backup: ${bkTxMatched}/${backupTxs.length} matched = ${((bkTxMatched/backupTxs.length)*100).toFixed(1)}% (solo Santander CC)`);
    console.log(`  Actual: ${curMatched}/${currentTxs.length} matched = ${((curMatched/currentTxs.length)*100).toFixed(1)}% (TODAS las cuentas)`);
    
    // Calcular tasa solo para la misma cuenta Santander
    const santanderAccId = backupTxs[0]?.bankAccountId;
    if (santanderAccId) {
        const curSantanderTxs = currentTxs.filter(t => t.bankAccountId === santanderAccId);
        const curSantanderMatched = curSantanderTxs.filter(t => t.status === 'MATCHED').length;
        console.log(`  Actual (solo Santander CC): ${curSantanderMatched}/${curSantanderTxs.length} matched = ${curSantanderTxs.length > 0 ? ((curSantanderMatched/curSantanderTxs.length)*100).toFixed(1) : 'N/A'}%`);
    }

    console.log('\n✅ Análisis completado (sin modificaciones a la BD)\n');
}

main().catch(e => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
