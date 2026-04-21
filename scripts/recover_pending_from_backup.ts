import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- BUSCANDO 180 PENDIENTES 2026 EN BACKUP PRE-MIGRACION ---');

    const backupDir = 'd:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z';
    const oldMatchesFile = `${backupDir}\\bravium_reconciliation_matches.json`;
    const oldTxFile = `${backupDir}\\bravium_santander_cc_transactions.json`;

    if (!fs.existsSync(oldMatchesFile) || !fs.existsSync(oldTxFile)) {
        console.error('Backup files missing');
        return;
    }

    const oldMatches = JSON.parse(fs.readFileSync(oldMatchesFile, 'utf8'));
    const oldTxsArr = JSON.parse(fs.readFileSync(oldTxFile, 'utf8'));

    // Crear mapas de la BD vieja
    const oldTxMap = new Map();
    for (const t of oldTxsArr) {
        oldTxMap.set(t.id, t);
    }

    // Mapear viejo tx -> dteId de Bravium anterior (que es el mismo dteId actual)
    const oldMatchByTx = new Map();
    for (const m of oldMatches) {
        if (m.status === 'CONFIRMED' || m.status === 'ACCEPTED') {
            oldMatchByTx.set(m.transactionId, m);
        }
    }

    // Obtener los actuales transacciones PENDING en nuestra BD de 2026
    const pendingTxs = await prisma.bankTransaction.findMany({
        where: { 
            status: 'PENDING',
            date: { gte: new Date('2026-01-01T00:00:00.000Z') }
        }
    });

    console.log(`Transacciones bancarias actuales en estado PENDING: ${pendingTxs.length}`);

    let recoverables = 0;

    for (const currentTx of pendingTxs) {
        // Encontrar una trx en el backup que sea indentica (fecha y monto)
        const oldTx = oldTxsArr.find((t: any) => 
            Math.abs(t.amount) === Math.abs(currentTx.amount) &&
            new Date(t.date).toISOString().substring(0,10) === currentTx.date.toISOString().substring(0,10)
        );

        if (oldTx) {
            // Ver si ese oldTx tenia un match guardado!
            const oldMatch = oldMatchByTx.get(oldTx.id);
            if (oldMatch) {
                // Hay un match antiguo! Vamos a ver si el DTE asociado todavia se asume sin pagar en nuestra nueva base (por si las dudas)
                const dte = await prisma.dTE.findUnique({ where: { id: oldMatch.dteId } });
                
                if (dte) {
                   console.log(`\n⚠️ PENDIENTE ENCONTRADO EN BACKUP ⚠️`);
                   console.log(`Tx Actual: $${currentTx.amount} | Fecha: ${currentTx.date.toISOString().substring(0,10)} | Ref: ${currentTx.reference}`);
                   console.log(`Antiguo Match: Estuvo matcheado con DTE Folio ${dte.folio} (Rut: ${dte.issuerRut})`);
                   console.log(`Estado actual DTE: ${dte.paymentStatus} (Deuda: ${dte.outstandingAmount})`);
                   recoverables++;
                }
            } else {
                // console.log(`Old tx found but no match back then for $${currentTx.amount}`);
            }
        }
    }

    console.log(`\nResumen: De las ${pendingTxs.length} transacciones actuales pendientes, ${recoverables} tenían matches explícitos en la base vieja.`);

}

main().catch(console.error).finally(() => prisma.$disconnect());
