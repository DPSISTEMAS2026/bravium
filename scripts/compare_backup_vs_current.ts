import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    const backupDir = 'd:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z';
    const targetAccountId = 'acc-santander-9219882-0';

    // Leer backup
    const backupMatches = JSON.parse(fs.readFileSync(`${backupDir}\\bravium_reconciliation_matches.json`, 'utf8'));
    const backupTxs = JSON.parse(fs.readFileSync(`${backupDir}\\bravium_santander_cc_transactions.json`, 'utf8'));

    // Estado actual
    const currentMatches = await prisma.reconciliationMatch.findMany({
        where: { transaction: { bankAccountId: targetAccountId } },
        include: { dte: { select: { folio: true, type: true, totalAmount: true } } }
    });

    const currentTxs = await prisma.bankTransaction.count({ where: { bankAccountId: targetAccountId } });

    console.log("========== COMPARACIÓN BACKUP vs ACTUAL ==========\n");
    
    console.log("TRANSACCIONES:");
    console.log(`  Backup: ${backupTxs.length}`);
    console.log(`  Actual: ${currentTxs}`);
    console.log(`  Diferencia: +${currentTxs - backupTxs.length} (los nuevos de Fintoc Abril + duplicados manuales)\n`);

    // Matches por status en backup
    const backupByStatus: Record<string, number> = {};
    backupMatches.forEach((m: any) => {
        backupByStatus[m.status] = (backupByStatus[m.status] || 0) + 1;
    });

    const currentByStatus: Record<string, number> = {};
    currentMatches.forEach(m => {
        currentByStatus[m.status] = (currentByStatus[m.status] || 0) + 1;
    });

    console.log("MATCHES DE CONCILIACIÓN:");
    console.log(`  Backup total: ${backupMatches.length}`);
    Object.entries(backupByStatus).forEach(([s, c]) => console.log(`    ${s}: ${c}`));
    console.log(`  Actual total: ${currentMatches.length}`);
    Object.entries(currentByStatus).forEach(([s, c]) => console.log(`    ${s}: ${c}`));

    // ¿Cuántos DTEs del backup siguen matcheados?
    const backupDteIds = new Set(backupMatches.filter((m: any) => m.dteId).map((m: any) => m.dteId));
    const currentDteIds = new Set(currentMatches.filter(m => m.dteId).map(m => m.dteId));

    const preserved = [...backupDteIds].filter(id => currentDteIds.has(id));
    const lost = [...backupDteIds].filter(id => !currentDteIds.has(id));
    const newOnes = [...currentDteIds].filter(id => !backupDteIds.has(id));

    console.log(`\nDTEs MATCHEADOS:`);
    console.log(`  En backup: ${backupDteIds.size} DTEs únicos`);
    console.log(`  Actualmente: ${currentDteIds.size} DTEs únicos`);
    console.log(`  ✅ Preservados: ${preserved.length}`);
    console.log(`  ❌ Perdidos: ${lost.length}`);
    console.log(`  🆕 Nuevos (no estaban antes): ${newOnes.length}`);

    if (lost.length > 0 && lost.length <= 20) {
        console.log(`\n  DTEs perdidos (folios):`);
        for (const dteId of lost) {
            const dte = await prisma.dTE.findUnique({ where: { id: dteId as string }, select: { folio: true, type: true, totalAmount: true, provider: { select: { name: true } } } });
            if (dte) console.log(`    Folio ${dte.folio} T${dte.type} | $${dte.totalAmount} | ${dte.provider?.name}`);
        }
    }

    console.log("\n===================================================");
}

main().catch(console.error).finally(() => prisma.$disconnect());
