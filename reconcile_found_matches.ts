import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('=== CONCILIAR FACTURAS CON TX ENCONTRADAS ===\n');

    // Definir los matches manuales basados en la investigación
    const toReconcile: { folio: number; txAmount: number; txDesc: string; txStatus: string }[] = [
        // PARTIALLY_MATCHED - conciliar DTE con la tx
        { folio: 11617, txAmount: -699345, txDesc: 'COMPRA NACIONAL', txStatus: 'PARTIALLY_MATCHED' },
        { folio: 85379, txAmount: -207810, txDesc: 'COMPRA NACIONAL', txStatus: 'PARTIALLY_MATCHED' },
        { folio: 501151, txAmount: -623970, txDesc: 'COMPRA NACIONAL', txStatus: 'PARTIALLY_MATCHED' },
        // MATCHED con tx pero DTE no PAID
        { folio: 878, txAmount: -198900, txDesc: '76.594.462', txStatus: 'MATCHED' },
        { folio: 889, txAmount: -208900, txDesc: '76.594.462', txStatus: 'MATCHED' },
        { folio: 895318, txAmount: -466626, txDesc: '82.525.800', txStatus: 'MATCHED' },
        { folio: 22010, txAmount: -15920, txDesc: '78.417.630', txStatus: 'MATCHED' },
        // Feb TC/Webpay - intentar match por monto
        { folio: 421900, txAmount: -563970, txDesc: 'FALABELLA', txStatus: 'any' },
        { folio: 5516267, txAmount: -556690, txDesc: 'PC FACTORY', txStatus: 'any' },
        { folio: 5821903, txAmount: -295980, txDesc: 'ROSEN', txStatus: 'any' },
        { folio: 988557, txAmount: -140979, txDesc: 'MAIGAS', txStatus: 'any' },
        { folio: 18357, txAmount: -128890, txDesc: 'MERCADO', txStatus: 'any' },
        { folio: 13078811, txAmount: -19890, txDesc: 'CHILEXPRESS', txStatus: 'any' },
        // Patagonik 339959 del 30/03
        { folio: 15005, txAmount: -339959, txDesc: 'PATAGONIK', txStatus: 'any' },
    ];

    let conciliadas = 0;
    let dtePaid = 0;
    let noEncontradas = 0;

    for (const item of toReconcile) {
        // Buscar DTE
        const dte = await prisma.dTE.findFirst({
            where: { folio: item.folio, paymentStatus: { not: 'PAID' } }
        });
        if (!dte) {
            // Ya pagado?
            const dtePaid2 = await prisma.dTE.findFirst({ where: { folio: item.folio } });
            if (dtePaid2 && dtePaid2.paymentStatus === 'PAID') {
                console.log(`  ✓ Folio ${item.folio} ya está PAID`);
            } else {
                console.log(`  ⚠️ Folio ${item.folio} no encontrado`);
            }
            continue;
        }

        // Buscar transacción bancaria
        const amountSearch = Math.abs(item.txAmount);
        const txCandidates = await prisma.bankTransaction.findMany({
            where: {
                amount: { gte: -(amountSearch + 100), lte: -(amountSearch - 100) },
                date: { gte: new Date('2026-01-01') }
            },
            orderBy: { date: 'desc' }
        });

        // Filtrar por descripción si hay
        let bestTx = txCandidates[0];
        if (item.txDesc !== 'any' && txCandidates.length > 1) {
            const filtered = txCandidates.filter(t => 
                t.description.toUpperCase().includes(item.txDesc.toUpperCase())
            );
            if (filtered.length > 0) bestTx = filtered[0];
        }

        if (!bestTx) {
            console.log(`  ❌ Folio ${item.folio} ($${dte.totalAmount.toLocaleString('es-CL')}) - Sin tx bancaria`);
            noEncontradas++;
            continue;
        }

        // Verificar si ya existe match para esta tx+dte
        const existingMatch = await prisma.reconciliationMatch.findFirst({
            where: { dteId: dte.id, status: 'CONFIRMED' }
        });

        if (existingMatch) {
            // Solo actualizar DTE a PAID
            await prisma.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'PAID' } });
            dtePaid++;
            console.log(`  ✅ Folio ${item.folio} → DTE marcado PAID (match ya existía)`);
            continue;
        }

        // Verificar si la tx ya tiene match con OTRO DTE
        const txMatch = await prisma.reconciliationMatch.findFirst({
            where: { transactionId: bestTx.id, status: 'CONFIRMED' }
        });

        if (txMatch) {
            // La tx ya está matcheada. Solo marcar el DTE como PAID y crear un match secundario
            await prisma.reconciliationMatch.create({
                data: {
                    transactionId: bestTx.id,
                    dteId: dte.id,
                    status: 'CONFIRMED',
                    confidence: 0.95,
                    origin: 'MANUAL',
                    notes: `Conciliado via Excel - TX compartida con otro DTE`,
                    confirmedAt: new Date(),
                    confirmedBy: 'EXCEL_RECONCILE',
                    ruleApplied: 'ExcelFolioMatch'
                }
            });
            await prisma.dTE.update({ where: { id: dte.id }, data: { paymentStatus: 'PAID' } });
            conciliadas++;
            console.log(`  ✅ Folio ${item.folio} ($${dte.totalAmount.toLocaleString('es-CL')}) → Tx ${bestTx.date.toISOString().split('T')[0]} "${bestTx.description}" [${bestTx.status}] (tx compartida)`);
            continue;
        }

        // Crear match nuevo
        try {
            await prisma.reconciliationMatch.create({
                data: {
                    transactionId: bestTx.id,
                    dteId: dte.id,
                    status: 'CONFIRMED',
                    confidence: 1.0,
                    origin: 'MANUAL',
                    notes: `Conciliado via Excel`,
                    confirmedAt: new Date(),
                    confirmedBy: 'EXCEL_RECONCILE',
                    ruleApplied: 'ExcelFolioMatch'
                }
            });

            if (bestTx.status !== 'MATCHED') {
                await prisma.bankTransaction.update({
                    where: { id: bestTx.id },
                    data: { status: 'MATCHED' }
                });
            }

            await prisma.dTE.update({
                where: { id: dte.id },
                data: { paymentStatus: 'PAID' }
            });

            conciliadas++;
            console.log(`  ✅ Folio ${item.folio} ($${dte.totalAmount.toLocaleString('es-CL')}) → Tx ${bestTx.date.toISOString().split('T')[0]} "${bestTx.description}" [${bestTx.status}]`);
        } catch (e: any) {
            console.log(`  ❌ Error folio ${item.folio}: ${e.message}`);
        }
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`  Conciliadas: ${conciliadas}`);
    console.log(`  Solo DTE→PAID: ${dtePaid}`);
    console.log(`  Sin tx: ${noEncontradas}`);

    const fp = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    const fu = await prisma.bankTransaction.count({ where: { status: 'UNMATCHED' } });
    const fm = await prisma.bankTransaction.count({ where: { status: 'MATCHED' } });
    const dp = await prisma.dTE.count({ where: { paymentStatus: { not: 'PAID' }, issuedDate: { gte: new Date('2026-01-01') } } });

    console.log(`\n  Transacciones: ${fp} PENDING, ${fu} UNMATCHED, ${fm} MATCHED`);
    console.log(`  DTEs 2026 pendientes: ${dp}`);

    await prisma.$disconnect();
}
main().catch(console.error);
