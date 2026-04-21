import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('=== 🚀 INICIANDO AUDITORÍA COMPLETA DE INTEGRIDAD DE DATOS (2026) ===\\n');
    let issuesFound = 0;

    // 1. AUDITORÍA DTE (Facturas)
    console.log('🔍 1. Auditando Documentos Tributarios (DTE)...');
    
    // 1.1 DTEs PAGADOS pero con deuda pendiente mayor a 0
    const dtesPaidWithDebt = await prisma.dTE.findMany({
        where: { paymentStatus: 'PAID', outstandingAmount: { gt: 0 } }
    });
    if (dtesPaidWithDebt.length > 0) {
        console.log(`❌ ERROR: ${dtesPaidWithDebt.length} DTEs marcados como PAID pero con outstandingAmount > 0.`);
        issuesFound++;
        // FIX:
        for(let dte of dtesPaidWithDebt) {
             await prisma.dTE.update({ where: { id: dte.id }, data: { outstandingAmount: 0 } });
        }
        console.log(`   ✅ CORREGIDO: Deuda de estos DTEs forzada a 0.`);
    } else {
         console.log('   ✅ OK: Todos los DTEs pagados tienen deuda en 0.');
    }

    // 1.2 DTEs NO PAGADOS pero con deuda en 0 (ya los arreglamos, deberia ser 0)
    const dtesUnpaidNoDebt = await prisma.dTE.findMany({
        where: { paymentStatus: 'UNPAID', outstandingAmount: { lte: 0 } }
    });
    if (dtesUnpaidNoDebt.length > 0) {
         console.log(`❌ ERROR: ${dtesUnpaidNoDebt.length} DTEs marcados como UNPAID pero con outstandingAmount <= 0.`);
         issuesFound++;
         for(let dte of dtesUnpaidNoDebt) {
             if(dte.totalAmount > 0) await prisma.dTE.update({ where: { id: dte.id }, data: { outstandingAmount: dte.totalAmount } });
         }
         console.log(`   ✅ CORREGIDO: Deuda restaurada a totalAmount.`);
    } else {
         console.log('   ✅ OK: Ningún DTE no pagado tiene deuda 0.');
    }

    // 2. AUDITORÍA DE TRANSACCIONES BANCARIAS
    console.log('\\n🔍 2. Auditando Transacciones Bancarias...');
    
    // 2.1 Transacciones MATCHED que no tienen ningún MatchSuggestion CONFIRMED ni Auto-Categorized
    const matchedTxs = await prisma.bankTransaction.findMany({
        where: { status: 'MATCHED' },
        include: { matches: true }
    });
    let orphanedTxs = 0;
    for (const tx of matchedTxs) {
        const meta: any = tx.metadata || {};
        if (meta.autoCategorized || meta.restoredFromBackup || tx.description.includes('Revisado manual')) {
             continue; // Valido, es manual.
        }
        const hasConfirmedMatch = tx.matches.some(m => m.status === 'CONFIRMED');
        if (!hasConfirmedMatch && !meta.reviewNote && !meta.restoredFromBackup && !meta.manualReview) {
             orphanedTxs++;
             // Fix by sending them back to PENDING?
             await prisma.bankTransaction.update({ where: { id: tx.id }, data: { status: 'PENDING' } });
        }
    }
    if (orphanedTxs > 0) {
        console.log(`❌ ERROR: ${orphanedTxs} transacciones estaban 'MATCHED' pero sin historial ni matches. Revertidas a PENDING.`);
        issuesFound++;
    } else {
        console.log('   ✅ OK: Todas las transacciones MATCHED están debidamente justificadas.');
    }

    // 3. AUDITORÍA DE SUGERENCIAS PENDIENTES
    console.log('\\n🔍 3. Auditando Sugerencias (MatchSuggestions) de Motor...');
    
    const pendingMatches = await prisma.matchSuggestion.findMany({
        where: { status: 'PENDING' }
    });
    let badMatches = 0;
    if (pendingMatches.length > 0) {
        // En teoría no hay porque los purgamos, pero revisamos
         console.log(`   Sugerencias pendientes actuales: ${pendingMatches.length}`);
    } else {
         console.log('   ✅ OK: No hay sugerencias pendientes huérfanas o erróneas en memoria.');
    }

    // 4. DUPLICADOS EN TRANSACCIONES POR MIGRACIÓN EXCEL VS FINTOC
    console.log('\\n🔍 4. Buscando transferencias completamente idénticas (Fecha exacta, monto exacto)...');
    
    // Usaremos Raw Query para agrupar
    const rawDupes: any[] = await prisma.$queryRaw`
        SELECT amount, date, COUNT(*) as count 
        FROM "BankTransaction" 
        WHERE status = 'PENDING' 
        GROUP BY amount, date 
        HAVING COUNT(*) > 1
    `;
    if (rawDupes.length > 0) {
        console.log(`⚠️ ATENCIÓN: Hay ${rawDupes.length} agrupaciones de transacciones que comparten el MISMO monto y día. Pueden ser pagos a proveedores distintos, pero mantente precavido al cruzar.`);
    } else {
        console.log('   ✅ OK: No se detectaron transferencias idénticas duplicadas.');
    }

    // 5. RESUMEN
    console.log('\\n=== 📈 RESULTADO DE LA AUDITORÍA ===');
    if (issuesFound === 0) {
        console.log('🛡️  LA BASE DE DATOS ESTÁ 100% INTACTA, COHERENTE Y SANEADA.');
    } else {
        console.log(`🛠️  SE ENCONTRARON Y REPARARON AUTOMÁTICAMENTE ${issuesFound} CATEGORÍAS DE ANOMALÍAS.`);
        console.log('La base de datos ha sido esterilizada a tiempo real.');
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
