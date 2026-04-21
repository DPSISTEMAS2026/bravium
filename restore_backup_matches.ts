import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    console.log('=== RESTAURAR MATCHES PERDIDOS DESDE BACKUP ===\n');

    // Cargar backup
    const backupMatches = JSON.parse(
        fs.readFileSync('d:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z\\bravium_reconciliation_matches.json', 'utf-8')
    );
    const backupFintoc = JSON.parse(
        fs.readFileSync('d:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z\\dp_fintoc_transactions.json', 'utf-8')
    );
    const backupSantander = JSON.parse(
        fs.readFileSync('d:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z\\bravium_santander_cc_transactions.json', 'utf-8')
    );

    const backupTxById: Record<string, any> = {};
    for (const tx of [...backupFintoc, ...backupSantander]) {
        backupTxById[tx.id] = tx;
    }

    const matchByTxId: Record<string, any> = {};
    for (const m of backupMatches) {
        if (m.status === 'CONFIRMED' || m.status === 'ACCEPTED') {
            matchByTxId[m.transactionId] = m;
        }
    }

    // Cargar pendientes
    const pending = await prisma.bankTransaction.findMany({
        where: { status: 'PENDING' }
    });

    let restored = 0;
    let failed = 0;

    for (const tx of pending) {
        const amount = tx.amount;
        const date = tx.date.toISOString().split('T')[0];

        let bestMatch: any = null;

        for (const btxId of Object.keys(matchByTxId)) {
            const btx = backupTxById[btxId];
            if (!btx) continue;

            const bAmount = Number(btx.amount);
            const bDate = String(btx.date || btx.post_date || '').split('T')[0];

            if (bAmount === amount) {
                const txDate = new Date(date).getTime();
                const bTxDate = new Date(bDate).getTime();
                const daysDiff = Math.abs(txDate - bTxDate) / (86400 * 1000);

                if (daysDiff <= 3) {
                    bestMatch = matchByTxId[btxId];
                    break;
                }

                const bDesc = String(btx.description || btx.gloss || '');
                if (bDesc.includes(tx.description.substring(0, 15)) || tx.description.includes(bDesc.substring(0, 15))) {
                    bestMatch = matchByTxId[btxId];
                    break;
                }
            }
        }

        if (!bestMatch) continue;

        // Verificar que el DTE existe en el sistema actual
        const dte = await prisma.dTE.findUnique({ where: { id: bestMatch.dteId } });
        if (!dte) {
            console.log(`  ❌ DTE ${bestMatch.dteId} no existe en sistema actual para $${tx.amount} "${tx.description}"`);
            failed++;
            continue;
        }

        // Verificar que el DTE no esté ya matcheado con otra transacción
        const existingMatch = await prisma.reconciliationMatch.findFirst({
            where: { dteId: dte.id, status: 'CONFIRMED' }
        });
        if (existingMatch) {
            console.log(`  ⚠️ DTE ${dte.id} (folio ${dte.folio}) ya tiene match activo, se omite`);
            continue;
        }

        // Crear el match y actualizar la transacción
        try {
            await prisma.reconciliationMatch.create({
                data: {
                    transactionId: tx.id,
                    dteId: dte.id,
                    status: 'CONFIRMED',
                    confidence: bestMatch.confidence || 1,
                    origin: 'MANUAL',
                    notes: `Restaurado desde backup. Match original: ${bestMatch.id}`,
                    confirmedAt: new Date(),
                    confirmedBy: 'BACKUP_RESTORE',
                    ruleApplied: 'BackupRestore'
                }
            });

            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: { status: 'MATCHED' }
            });

            // Marcar DTE como PAID si no lo está
            if (dte.paymentStatus !== 'PAID') {
                await prisma.dTE.update({
                    where: { id: dte.id },
                    data: { paymentStatus: 'PAID' }
                });
            }

            restored++;
            const dteIssuer = (dte as any).providerName || dte.rutIssuer || '?';
            console.log(`  ✅ $${tx.amount} (${date}) "${tx.description}" → DTE folio ${dte.folio} (${dteIssuer})`);
        } catch (e: any) {
            console.log(`  ❌ Error: ${e.message}`);
            failed++;
        }
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`  Restaurados: ${restored}`);
    console.log(`  Fallidos: ${failed}`);

    const finalPending = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    const finalUnmatched = await prisma.bankTransaction.count({ where: { status: 'UNMATCHED' } });
    const finalMatched = await prisma.bankTransaction.count({ where: { status: 'MATCHED' } });
    console.log(`\n  Estado: ${finalPending} PENDING, ${finalUnmatched} UNMATCHED, ${finalMatched} MATCHED`);

    await prisma.$disconnect();
}
main().catch(console.error);
