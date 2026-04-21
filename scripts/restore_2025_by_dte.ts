import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- BUSCANDO DTES PENDIENTES CON MATCH EN BACKUP (INDEPENDIENTE DE TRANSACCIÓN) ---');

    const backupDir = 'd:\\BRAVIUM-PRODUCCION\\backups\\pre_migration_2026-04-16T21-14-16-676Z';
    const oldMatchesFile = `${backupDir}\\bravium_reconciliation_matches.json`;

    if (!fs.existsSync(oldMatchesFile)) {
        console.error('Backup files missing');
        return;
    }

    const oldMatches = JSON.parse(fs.readFileSync(oldMatchesFile, 'utf8'));

    // Crear mapa de dteId -> antiguo match
    const oldMatchByDteId = new Map();
    for (const m of oldMatches) {
        if (m.status === 'CONFIRMED' || m.status === 'ACCEPTED') {
            if (m.dteId) oldMatchByDteId.set(m.dteId, m);
        }
    }

    // Buscar todos los DTEs que siguen pendientes de pago
    const pendingDtes = await prisma.dTE.findMany({
        where: { paymentStatus: { not: 'PAID' } }
    });

    console.log(`DTEs pendientes en la base actual: ${pendingDtes.length}`);

    let forcePaidCounter = 0;

    for (const dte of pendingDtes) {
        // ¿Tenía match comprobado en el backup?
        const oldMatch = oldMatchByDteId.get(dte.id);
        
        if (oldMatch) {
            console.log(`⚠️ DTE Folio ${dte.folio} (DTE Fecha: ${dte.issuedDate.toISOString().substring(0,10)}) figuraba pagado en el backup antiguo!`);
            
            // Ya que no tenemos la transaccion original o la hemos perdido por el límite de fecha de Fintoc (Jan 1 2026),
            // lo que podemos hacer es cerrarlo forzosamente marcándolo como PAID para que deje de generar sugerencias tontas.
            
            await prisma.dTE.update({
                where: { id: dte.id },
                data: { paymentStatus: 'PAID', outstandingAmount: 0 }
            });

            // Rechazar sugerencias
            await prisma.matchSuggestion.updateMany({
                where: { dteId: dte.id, status: 'PENDING' },
                data: { status: 'REJECTED' }
            });

            forcePaidCounter++;
        }
    }

    console.log(`\n🎉 Limpieza completada. DTEs cerrados por respeto al backup antiguo: ${forcePaidCounter}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
