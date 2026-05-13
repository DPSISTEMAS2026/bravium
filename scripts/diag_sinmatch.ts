import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
    const org = await p.organization.findFirst({ where: { isActive: true } });
    const orgId = org!.id;
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 180);

    // TXs sin match después del motor
    const sinMatch = await p.bankTransaction.findMany({
        where: {
            status: 'PENDING',
            type: 'DEBIT',
            date: { gte: lookbackDate },
            bankAccount: { organizationId: orgId },
        },
        select: { id: true, amount: true, date: true, description: true, metadata: true },
        orderBy: { date: 'asc' }
    });

    // DTEs pendientes
    const dtes = await p.dTE.findMany({
        where: { paymentStatus: { in: ['UNPAID', 'PARTIAL'] }, organizationId: orgId, type: { not: 61 } },
        select: { totalAmount: true, type: true, issuedDate: true, provider: { select: { name: true, rut: true } } }
    });
    const dteAmounts = new Set(dtes.map(d => d.totalAmount));

    console.log(`TXs sin match: ${sinMatch.length}`);
    console.log(`DTEs pendientes: ${dtes.length}\n`);

    // Analizar por qué no matchean
    let noAmountMatch = 0, hasAmountMatch = 0;
    const closestMiss: Array<{tx: any, diff: number, dte: any}> = [];

    for (const tx of sinMatch) {
        const txAbs = Math.abs(tx.amount);
        if (dteAmounts.has(txAbs)) {
            hasAmountMatch++;
        } else {
            noAmountMatch++;
            // Buscar el DTE más cercano en monto
            let minDiff = Infinity, closestDte: any = null;
            for (const d of dtes) {
                const diff = Math.abs(d.totalAmount - txAbs);
                if (diff < minDiff) { minDiff = diff; closestDte = d; }
            }
            if (minDiff < 50000) closestMiss.push({ tx, diff: minDiff, dte: closestDte });
        }
    }

    console.log(`  Sin coincidencia de monto: ${noAmountMatch}`);
    console.log(`  Tiene coincidencia de monto (bloqueado por fecha/prioridad): ${hasAmountMatch}`);

    console.log('\nTXs sin match que tienen DTE cercano (diff < $50.000):');
    for (const c of closestMiss.slice(0, 20)) {
        const txAbs = Math.abs(c.tx.amount);
        const pct = ((c.diff / txAbs) * 100).toFixed(1);
        console.log(`  TX $${txAbs.toLocaleString('es-CL')} [${c.tx.date.toISOString().slice(0,10)}] "${c.tx.description?.slice(0,40)}" → DTE $${c.dte?.totalAmount?.toLocaleString('es-CL')} (diff: $${c.diff.toLocaleString('es-CL')} / ${pct}%) [${c.dte?.provider?.name?.slice(0,30)}]`);
    }

    console.log('\nTXs grandes sin match (>$500.000):');
    for (const tx of sinMatch.filter(t => Math.abs(t.amount) > 500000)) {
        console.log(`  $${Math.abs(tx.amount).toLocaleString('es-CL')} | ${tx.date.toISOString().slice(0,10)} | ${tx.description?.slice(0,60)}`);
    }
}
main().catch(console.error).finally(() => p.$disconnect());
