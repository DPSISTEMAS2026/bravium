import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const months = [
        { name: 'Enero', start: '2026-01-01', end: '2026-01-31' },
        { name: 'Febrero', start: '2026-02-01', end: '2026-02-28' },
        { name: 'Marzo', start: '2026-03-01', end: '2026-03-31' },
        { name: 'Abril', start: '2026-04-01', end: '2026-04-30' },
    ];

    console.log("--- ESTADO DE FACTURAS RECIBIDAS (2026) ---");

    let totalRec = 0;
    let totalConcil = 0;

    for (const m of months) {
        // Find all received invoices (usually have a providerId, or by definition they are entered into the system to be paid).
        // If type 33/34 are invoices. 
        const dtes = await prisma.dTE.findMany({
            where: {
                issuedDate: { gte: new Date(m.start), lte: new Date(m.end) }
            }
        });

        const total = dtes.length;
        if (total === 0) continue;

        // Payment status
        const paid = dtes.filter(d => ['PAID', 'OVERPAID'].includes(d.paymentStatus)).length;
        const unpaid = dtes.filter(d => ['UNPAID', 'PARTIAL'].includes(d.paymentStatus)).length;

        totalRec += total;
        totalConcil += paid;

        const pagadasPct = ((paid / total) * 100).toFixed(1);

        console.log(`\n[${m.name}]`);
        console.log(` - Total Recibidas: ${total}`);
        console.log(` - Conciliadas (PAID): ${paid} (${pagadasPct}%)`);
        console.log(` - Pendientes (UNPAID/PARTIAL): ${unpaid}`);
    }

    const totalPct = ((totalConcil / totalRec) * 100).toFixed(1);
    console.log(`\n--- RESUMEN GLOBAL Q1+Abril ---`);
    console.log(`Total Recibidas: ${totalRec}`);
    console.log(`Conciliadas Exitosamente: ${totalConcil} (${totalPct}%)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
