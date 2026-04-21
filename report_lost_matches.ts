import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ORG_ID = '715545b8-4522-4bb1-be81-3047546c0e8c';

async function main() {
    // 1. Sugerencias Pendientes Exactas
    const suggestions = await prisma.matchSuggestion.findMany({
        where: {
            organizationId: ORG_ID,
            status: 'PENDING'
        },
        include: {
            dte: { include: { provider: true } }
        },
        orderBy: { confidence: 'desc' }
    });

    const highConfidence = suggestions.filter(s => s.confidence >= 0.9);
    const mediumConfidence = suggestions.filter(s => s.confidence >= 0.7 && s.confidence < 0.9);

    console.log(`🔎 SUGERENCIAS DEL MOTOR:`);
    console.log(`- Alta Confianza (>= 0.9): ${highConfidence.length} sugerencias`);
    console.log(`- Media Confianza (0.7 - 0.89): ${mediumConfidence.length} sugerencias`);

    if (highConfidence.length > 0) {
        console.log('\n🌟 EJEMPLOS DE ALTA CONFIANZA:');
        for (const s of highConfidence.slice(0, 5)) {
            console.log(`  🔹 DTE Folio ${s.dte?.folio} (${s.dte?.provider?.name}) por $${s.dte?.totalAmount} -> Confianza: ${s.confidence.toFixed(2)}`);
        }
    }

    // 2. Busqueda de "huérfanos perfectos" (Monto y fecha idéntica pero sin sugerencia)
    const pendingDtes = await prisma.dTE.findMany({
        where: { organizationId: ORG_ID, paymentStatus: { in: ['UNPAID', 'PARTIAL'] }, outstandingAmount: { gt: 0 } },
        include: { provider: true }
    });

    const pendingTxs = await prisma.bankTransaction.findMany({
        where: { bankAccount: { organizationId: ORG_ID }, status: 'PENDING', type: 'DEBIT' }
    });

    let perfectMatches = [];
    for (const dte of pendingDtes) {
        const txs = pendingTxs.filter(t => Math.abs(t.amount) === dte.outstandingAmount);
        if (txs.length === 1) {
            const tx = txs[0];
            const diffDays = Math.abs((new Date(tx.date).getTime() - new Date(dte.issuedDate).getTime()) / (1000 * 3600 * 24));
            if (diffDays <= 7) {
                perfectMatches.push({ dte, tx, diffDays });
            }
        }
    }

    console.log(`\n🕵️ HUÉRFANOS EXACTOS ENCONTRADOS (Mismo Monto Único + Fecha cercana < 7 días): ${perfectMatches.length}`);
    if (perfectMatches.length > 0) {
        console.log('\n🌟 EJEMPLOS DE HUÉRFANOS:');
        for (const m of perfectMatches.slice(0, 10)) {
            console.log(`  🔹 DTE Folio ${m.dte.folio} (${m.dte.provider?.name}) $${m.dte.outstandingAmount} -> TX $${m.tx.amount} del ${new Date(m.tx.date).toISOString().split('T')[0]} (${m.tx.description})`);
        }
    }

    await prisma.$disconnect();
}

main().catch(console.error);
