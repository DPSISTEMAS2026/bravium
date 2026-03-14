/**
 * Limpieza de cartolas: mantiene solo los archivos indicados y elimina el resto.
 * - Lista cartolas: node scripts/cleanup_cartolas.js --list
 * - Limpiar (mantener solo los 6): node scripts/cleanup_cartolas.js "Archivo1.xlsx" "Archivo2.xlsx" ...
 *   o: KEEP_FILES="file1.xlsx,file2.xlsx" node scripts/cleanup_cartolas.js
 *
 * No borra proveedores ni DTEs; revierte estado de pago de DTEs que pierden su match.
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listSourceFiles() {
    const rows = await prisma.$queryRaw`
        SELECT metadata->>'sourceFile' AS filename, bt."bankAccountId", ba."bankName", ba."accountNumber", COUNT(*)::bigint AS count
        FROM bank_transactions bt
        JOIN bank_accounts ba ON ba.id = bt."bankAccountId"
        WHERE metadata->>'sourceFile' IS NOT NULL AND metadata->>'sourceFile' != ''
        GROUP BY metadata->>'sourceFile', bt."bankAccountId", ba."bankName", ba."accountNumber"
        ORDER BY ba."bankName", filename
    `;
    console.log('\n📋 Cartolas en la base de datos:\n');
    rows.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.filename}`);
        console.log(`     Cuenta: ${r.bankName} - ${r.accountNumber} | Movimientos: ${r.count}`);
    });
    console.log('\nPara mantener solo 6 (3 CC + 3 TC), ejecuta:');
    console.log('  node scripts/cleanup_cartolas.js "nombre1.xlsx" "nombre2.xlsx" ...\n');
    return rows;
}

async function cleanupExcept(keepSourceFiles) {
    const keep = keepSourceFiles.map((f) => String(f).trim()).filter(Boolean);
    if (keep.length === 0) {
        throw new Error('Indica al menos un archivo a mantener.');
    }

    const placeholders = keep.map((_, i) => `$${i + 1}`).join(', ');
    const idsResult = await prisma.$queryRawUnsafe(
        `SELECT id FROM bank_transactions WHERE (metadata->>'sourceFile' IS NULL OR metadata->>'sourceFile' = '' OR metadata->>'sourceFile' NOT IN (${placeholders}))`,
        ...keep
    );
    const idsToDelete = idsResult.map((r) => r.id);

    if (idsToDelete.length === 0) {
        console.log('✅ No hay transacciones que eliminar. Todas pertenecen a los archivos indicados.');
        return;
    }

    const dteIdsToReset = await prisma.reconciliationMatch.findMany({
        where: { transactionId: { in: idsToDelete }, dteId: { not: null } },
        select: { dteId: true },
    });
    const uniqueDteIds = [...new Set(dteIdsToReset.map((m) => m.dteId).filter(Boolean))];

    const result = await prisma.$transaction(async (tx) => {
        const delMatches = await tx.reconciliationMatch.deleteMany({
            where: { transactionId: { in: idsToDelete } },
        });
        const suggestions = await tx.matchSuggestion.findMany({
            where: { status: 'PENDING' },
            select: { id: true, transactionIds: true },
        });
        const toDeleteSuggestionIds = suggestions
            .filter((s) => ((s.transactionIds || [])).some((tid) => idsToDelete.includes(tid)))
            .map((s) => s.id);
        let deletedSuggestions = 0;
        if (toDeleteSuggestionIds.length > 0) {
            deletedSuggestions = (await tx.matchSuggestion.deleteMany({ where: { id: { in: toDeleteSuggestionIds } } })).count;
        }

        await tx.paymentRecord.updateMany({
            where: { transactionId: { in: idsToDelete } },
            data: { transactionId: null },
        });
        await tx.bankTransaction.deleteMany({
            where: { id: { in: idsToDelete } },
        });

        let resetCount = 0;
        for (const dteId of uniqueDteIds) {
            const otherMatch = await tx.reconciliationMatch.findFirst({
                where: { dteId, status: 'CONFIRMED' },
            });
            if (!otherMatch) {
                const dte = await tx.dTE.findUnique({ where: { id: dteId } });
                if (dte) {
                    await tx.dTE.update({
                        where: { id: dteId },
                        data: { paymentStatus: 'UNPAID', outstandingAmount: dte.totalAmount },
                    });
                    resetCount++;
                }
            }
        }

        return {
            deletedTransactions: idsToDelete.length,
            deletedMatches: delMatches.count,
            deletedSuggestions,
            resetDtes: resetCount,
        };
    });

    console.log('\n✅ Limpieza completada:');
    console.log(`   Transacciones eliminadas: ${result.deletedTransactions}`);
    console.log(`   Matches eliminados: ${result.deletedMatches}`);
    console.log(`   Sugerencias eliminadas: ${result.deletedSuggestions}`);
    console.log(`   DTEs vueltos a Pendiente: ${result.resetDtes}`);
    console.log('\n   Proveedores y RUTs se mantienen. Puedes ejecutar conciliación con las 6 cartolas.\n');
}

async function main() {
    const args = process.argv.slice(2);
    if (args[0] === '--list' || args[0] === '-l') {
        await listSourceFiles();
        return;
    }

    let keepFiles = args.filter((a) => !a.startsWith('-'));
    if (keepFiles.length === 0 && process.env.KEEP_FILES) {
        keepFiles = process.env.KEEP_FILES.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (keepFiles.length === 0) {
        console.log('Uso:');
        console.log('  node scripts/cleanup_cartolas.js --list   # listar cartolas');
        console.log('  node scripts/cleanup_cartolas.js "file1.xlsx" "file2.xlsx" ...   # mantener solo esos');
        process.exit(1);
    }

    console.log('\n🔄 Manteniendo solo estos archivos:', keepFiles);
    await cleanupExcept(keepFiles);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
