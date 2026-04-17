import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const targetAccountId = 'acc-santander-9219882-0';

    // Estado actual de transacciones
    const statusCounts = await prisma.bankTransaction.groupBy({
        by: ['status'],
        where: { bankAccountId: targetAccountId },
        _count: { id: true }
    });

    // Estado actual por origin
    const originCounts = await prisma.bankTransaction.groupBy({
        by: ['origin'],
        where: { bankAccountId: targetAccountId },
        _count: { id: true }
    });

    // Matches por status
    const matchStatusCounts = await prisma.reconciliationMatch.groupBy({
        by: ['status'],
        where: { transaction: { bankAccountId: targetAccountId } },
        _count: { id: true }
    });

    // Total transacciones
    const totalTx = await prisma.bankTransaction.count({
        where: { bankAccountId: targetAccountId }
    });

    // Match suggestions pendientes
    const pendingSuggestions = await prisma.matchSuggestion.count({
        where: { 
            status: 'PENDING',
            organizationId: '715545b8-4522-4bb1-be81-3047546c0e8c'
        }
    });

    console.log("========== DIAGNÓSTICO COMPLETO ==========\n");
    console.log(`Total transacciones en Santander CC: ${totalTx}`);
    console.log("\nPor Status:");
    statusCounts.forEach(s => console.log(`  ${s.status}: ${s._count.id}`));
    console.log("\nPor Origen:");
    originCounts.forEach(s => console.log(`  ${s.origin}: ${s._count.id}`));
    console.log("\nMatches de Conciliación:");
    matchStatusCounts.forEach(s => console.log(`  ${s.status}: ${s._count.id}`));
    console.log(`\nSugerencias pendientes (MatchSuggestion): ${pendingSuggestions}`);

    // Verificar backup
    const fs = require('fs');
    const backupDir = 'd:\\BRAVIUM-PRODUCCION\\backups';
    if (fs.existsSync(backupDir)) {
        const dirs = fs.readdirSync(backupDir);
        console.log(`\n📦 Backups disponibles: ${dirs.join(', ')}`);
    }

    console.log("\n===========================================");
}

main().catch(console.error).finally(() => prisma.$disconnect());
