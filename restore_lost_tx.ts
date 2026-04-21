import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    console.log('=== RESTAURAR TX PERDIDAS DEL BACKUP Y CONCILIAR ===\n');

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

    // Folios a restaurar
    const folios = [
        421900, 5516267, 5821903, 988557, 18357,
        52774023, 52, 1264583, 14944, 14950, 893290, 279437,
        3123, 1264645, 51883, 51882, 6721, 143720, 351, 26895, 893531
    ];

    // Cuenta destino: Santander CC
    const SANTANDER_CC_ID = 'acc-santander-9219882-0';

    let restored = 0;
    let matchedToCurrent = 0;
    let errors = 0;

    for (const folio of folios) {
        const dte = await prisma.dTE.findFirst({ where: { folio } });
        if (!dte) continue;
        if (dte.paymentStatus === 'PAID') {
            console.log(`  ✓ Folio ${folio} ya PAID`);
            continue;
        }

        // Buscar match en backup
        const bMatch = backupMatches.find((m: any) => m.dteId === dte.id && m.status === 'CONFIRMED');
        if (!bMatch) continue;

        const bTx = backupTxById[bMatch.transactionId];
        if (!bTx) { console.log(`  ⚠️ Folio ${folio}: tx backup no encontrada`); continue; }

        const bAmount = Number(bTx.amount);
        const bDate = new Date((bTx.date || bTx.post_date).toString().split('T')[0]);
        const bDesc = bTx.description || bTx.gloss || '';

        // Primero intentar buscar tx existente en el sistema por monto+fecha
        const startDate = new Date(bDate.getTime() - 3 * 86400000);
        const endDate = new Date(bDate.getTime() + 3 * 86400000);
        
        let currentTx = await prisma.bankTransaction.findFirst({
            where: {
                amount: { gte: bAmount - 10, lte: bAmount + 10 },
                date: { gte: startDate, lte: endDate },
                status: { in: ['PENDING', 'UNMATCHED'] }
            }
        });

        if (!currentTx) {
            // Buscar también MATCHED por si ya se concilió con otro
            currentTx = await prisma.bankTransaction.findFirst({
                where: {
                    amount: { gte: bAmount - 10, lte: bAmount + 10 },
                    date: { gte: startDate, lte: endDate },
                    status: 'MATCHED'
                }
            });

            if (currentTx) {
                // La tx existe pero ya matcheada - crear match adicional y marcar DTE PAID
                await prisma.reconciliationMatch.create({
                    data: {
                        transactionId: currentTx.id,
                        dteId: dte.id,
                        status: 'CONFIRMED',
                        confidence: bMatch.confidence || 1,
                        origin: 'MANUAL',
                        notes: `Restaurado desde backup - tx compartida`,
                        confirmedAt: new Date(),
                        confirmedBy: 'BACKUP_RESTORE',
                        ruleApplied: 'BackupRestore'
                    }
                });
                await prisma.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'PAID' } });
                matchedToCurrent++;
                console.log(`  ✅ Folio ${folio} ($${dte.totalAmount.toLocaleString('es-CL')}) → Tx existente MATCHED ${currentTx.date.toISOString().split('T')[0]} "${currentTx.description}"`);
                continue;
            }
        }

        if (currentTx) {
            // Tx existe y está libre - crear match normal
            const existingDteMatch = await prisma.reconciliationMatch.findFirst({
                where: { dteId: dte.id, status: 'CONFIRMED' }
            });
            if (existingDteMatch) {
                await prisma.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'PAID' } });
                console.log(`  ✓ Folio ${folio} ya tenía match, solo marcado PAID`);
                continue;
            }

            await prisma.reconciliationMatch.create({
                data: {
                    transactionId: currentTx.id,
                    dteId: dte.id,
                    status: 'CONFIRMED',
                    confidence: bMatch.confidence || 1,
                    origin: 'MANUAL',
                    notes: `Restaurado desde backup`,
                    confirmedAt: new Date(),
                    confirmedBy: 'BACKUP_RESTORE',
                    ruleApplied: 'BackupRestore'
                }
            });
            await prisma.bankTransaction.update({ where: { id: currentTx.id }, data: { status: 'MATCHED' } });
            await prisma.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'PAID' } });
            restored++;
            console.log(`  ✅ Folio ${folio} ($${dte.totalAmount.toLocaleString('es-CL')}) → Tx ${currentTx.date.toISOString().split('T')[0]} "${currentTx.description}" [${currentTx.status}→MATCHED]`);
            continue;
        }

        // Tx NO existe — crear la transacción desde el backup
        try {
            const newTx = await prisma.bankTransaction.create({
                data: {
                    bankAccount: { connect: { id: SANTANDER_CC_ID } },
                    date: bDate,
                    amount: bAmount,
                    description: bDesc,
                    reference: `BACKUP-${bTx.id.substring(0, 8)}`,
                    type: bAmount < 0 ? 'DEBIT' : 'CREDIT',
                    status: 'MATCHED',
                    origin: 'MANUAL_UPLOAD',
                    metadata: {
                        restoredFromBackup: true,
                        originalTxId: bTx.id,
                        restoredAt: new Date().toISOString()
                    } as any
                }
            });

            await prisma.reconciliationMatch.create({
                data: {
                    transactionId: newTx.id,
                    dteId: dte.id,
                    status: 'CONFIRMED',
                    confidence: bMatch.confidence || 1,
                    origin: 'MANUAL',
                    notes: `Restaurado desde backup - tx recreada`,
                    confirmedAt: new Date(),
                    confirmedBy: 'BACKUP_RESTORE',
                    ruleApplied: 'BackupRestore'
                }
            });

            await prisma.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'PAID' } });
            restored++;
            console.log(`  ✅ Folio ${folio} ($${dte.totalAmount.toLocaleString('es-CL')}) → TX RECREADA: ${bDate.toISOString().split('T')[0]} $${bAmount} "${bDesc}"`);
        } catch (e: any) {
            console.log(`  ❌ Error folio ${folio}: ${e.message}`);
            errors++;
        }
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`  Restaurados (tx nueva o libre): ${restored}`);
    console.log(`  Matcheados a tx existente MATCHED: ${matchedToCurrent}`);
    console.log(`  Errores: ${errors}`);

    const fp = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    const fu = await prisma.bankTransaction.count({ where: { status: 'UNMATCHED' } });
    const fm = await prisma.bankTransaction.count({ where: { status: 'MATCHED' } });
    const dp = await prisma.dTE.count({ where: { paymentStatus: { not: 'PAID' }, issuedDate: { gte: new Date('2026-01-01') } } });

    console.log(`\n  Transacciones: ${fp} PENDING, ${fu} UNMATCHED, ${fm} MATCHED`);
    console.log(`  DTEs 2026 pendientes: ${dp}`);

    await prisma.$disconnect();
}
main().catch(console.error);
