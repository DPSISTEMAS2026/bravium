import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    console.log('=== BUSCAR PENDIENTES EN BACKUP ===\n');

    // 1. Cargar pendientes actuales
    const pending = await prisma.bankTransaction.findMany({
        where: { status: 'PENDING' }
    });
    console.log(`Transacciones PENDING actuales: ${pending.length}\n`);

    // 2. Cargar backup de matches
    const backupMatches = JSON.parse(
        fs.readFileSync('d:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z\\bravium_reconciliation_matches.json', 'utf-8')
    );
    console.log(`Matches en backup: ${backupMatches.length}`);

    // 3. Cargar backup de transacciones (ambas fuentes)
    const backupFintoc = JSON.parse(
        fs.readFileSync('d:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z\\dp_fintoc_transactions.json', 'utf-8')
    );
    const backupSantander = JSON.parse(
        fs.readFileSync('d:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z\\bravium_santander_cc_transactions.json', 'utf-8')
    );
    console.log(`Transacciones en backup: ${backupFintoc.length} Fintoc + ${backupSantander.length} Santander\n`);

    // 4. Crear mapa de matches por transacción (buscar por monto + fecha + descripción)
    // Primero mapear las transacciones del backup por ID
    const backupTxById: Record<string, any> = {};
    for (const tx of [...backupFintoc, ...backupSantander]) {
        backupTxById[tx.id] = tx;
    }

    // Crear mapa de matches: transactionId → match info (con DTE)
    const matchByTxId: Record<string, any> = {};
    for (const m of backupMatches) {
        if (m.status === 'CONFIRMED' || m.status === 'ACCEPTED') {
            matchByTxId[m.transactionId] = m;
        }
    }

    // 5. Para cada PENDING, buscar si existe un match en el backup
    let foundInBackup = 0;
    let notFound = 0;
    const foundItems: { tx: any; backupMatch: any; backupTx: any }[] = [];

    for (const tx of pending) {
        const amount = tx.amount;
        const date = tx.date.toISOString().split('T')[0];
        const desc = tx.description;

        // Buscar por: mismo monto Y (misma fecha O fecha cercana) Y descripción similar
        let bestBackupTx: any = null;
        let bestMatch: any = null;

        for (const btxId of Object.keys(matchByTxId)) {
            const btx = backupTxById[btxId];
            if (!btx) continue;

            const bAmount = Number(btx.amount);
            const bDate = String(btx.date || btx.post_date || '').split('T')[0];

            if (bAmount === amount) {
                // Verificar fecha (dentro de 3 días)
                const txDate = new Date(date).getTime();
                const bTxDate = new Date(bDate).getTime();
                const daysDiff = Math.abs(txDate - bTxDate) / (86400 * 1000);

                if (daysDiff <= 3) {
                    bestBackupTx = btx;
                    bestMatch = matchByTxId[btxId];
                    break;
                }
                
                // También probar por descripción similar
                const bDesc = String(btx.description || btx.gloss || '');
                if (bDesc.includes(desc.substring(0, 15)) || desc.includes(bDesc.substring(0, 15))) {
                    bestBackupTx = btx;
                    bestMatch = matchByTxId[btxId];
                    break;
                }
            }
        }

        if (bestMatch) {
            foundInBackup++;
            foundItems.push({ tx, backupMatch: bestMatch, backupTx: bestBackupTx });
        } else {
            notFound++;
        }
    }

    console.log(`\n=== RESULTADOS ===`);
    console.log(`  Encontrados en backup con match: ${foundInBackup}`);
    console.log(`  Sin match en backup: ${notFound}\n`);

    if (foundItems.length > 0) {
        console.log('--- PENDIENTES QUE TENÍAN MATCH EN BACKUP ---\n');
        for (const item of foundItems) {
            const tx = item.tx;
            const match = item.backupMatch;
            const btx = item.backupTx;
            console.log(`  $${tx.amount} | ${tx.date.toISOString().split('T')[0]} | "${tx.description}"`);
            console.log(`    Match backup: DTE=${match.dteId} | Status=${match.status} | Confidence=${match.confidence}`);
            console.log(`    Backup tx: ${btx?.date?.split('T')[0] || '?'} | "${btx?.description || btx?.gloss || '?'}"`);
            console.log();
        }
    }

    // 6. Mostrar los que NO tienen match para referencia
    console.log('--- PENDIENTES SIN MATCH EN BACKUP (primeros 30) ---\n');
    const noMatchTxs = pending.filter(tx => !foundItems.find(f => f.tx.id === tx.id));
    for (const tx of noMatchTxs.slice(0, 30)) {
        const meta = (tx.metadata as any) || {};
        console.log(`  $${tx.amount} | ${tx.date.toISOString().split('T')[0]} | "${tx.description}" | note: "${meta.reviewNote || '-'}"`);
    }
    if (noMatchTxs.length > 30) {
        console.log(`  ... y ${noMatchTxs.length - 30} más`);
    }

    await prisma.$disconnect();
}
main().catch(console.error);
