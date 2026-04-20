import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("--- Resumen de Conciliación Q1 2026 (Ene, Feb, Mar) ---\n");

    const months = [
        { name: 'Enero', start: '2026-01-01', end: '2026-01-31' },
        { name: 'Febrero', start: '2026-02-01', end: '2026-02-28' },
        { name: 'Marzo', start: '2026-03-01', end: '2026-03-31' },
    ];

    let allUnpaidDtes: any[] = [];
    let allPendingTxs: any[] = [];

    for (const m of months) {
        const dtes = await prisma.dTE.findMany({
            where: { issuedDate: { gte: new Date(m.start), lte: new Date(m.end) } },
            include: { provider: true }
        });
        const txs = await prisma.bankTransaction.findMany({
            where: { date: { gte: new Date(m.start), lte: new Date(m.end) } }
        });

        const unpaidDtes = dtes.filter(d => d.paymentStatus === 'UNPAID');
        const pendingTxs = txs.filter(t => t.status === 'PENDING');

        allUnpaidDtes = allUnpaidDtes.concat(unpaidDtes);
        allPendingTxs = allPendingTxs.concat(pendingTxs);

        const dtePct = dtes.length > 0 ? (((dtes.length - unpaidDtes.length) / dtes.length) * 100).toFixed(1) : '100.0';
        const txPct = txs.length > 0 ? (((txs.length - pendingTxs.length) / txs.length) * 100).toFixed(1) : '100.0';

        console.log(`[${m.name}] Facturas: ${dtePct}% pagadas (${unpaidDtes.length} pendientes de ${dtes.length})`);
        console.log(`[${m.name}] Banco: ${txPct}% conciliado (${pendingTxs.length} sueltos de ${txs.length})\n`);
    }

    console.log("--- TOP 5 PROVEEDORES CON MÁS FACTURAS PENDIENTES (Ene-Mar) ---");
    const provCount: Record<string, { count: number, total: number, name: string }> = {};
    for (const d of allUnpaidDtes) {
        const pName = d.provider?.name || 'Desconocido';
        if (!provCount[pName]) provCount[pName] = { count: 0, total: 0, name: pName };
        provCount[pName].count += 1;
        provCount[pName].total += d.totalAmount;
    }

    const topProviders = Object.values(provCount).sort((a, b) => b.count - a.count).slice(0, 10);
    topProviders.forEach((p, i) => {
         console.log(`${i+1}. ${p.name} -> ${p.count} facturas (Deuda aprox: $${p.total.toLocaleString()})`);
    });

    console.log("\n--- TOP 10 MOVIMIENTOS BANCARIOS PENDIENTES POR MONTO (Ene-Mar) ---");
    const largestTxs = allPendingTxs.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 10);
    largestTxs.forEach((t, i) => {
         console.log(`${i+1}. [${t.date.toISOString().split('T')[0]}] $${Math.abs(t.amount).toLocaleString()} (${t.type}) - ${t.description}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
