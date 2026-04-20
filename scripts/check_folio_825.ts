import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const folios = await prisma.dTE.findMany({
        where: {
            folio: { in: [825, 2235] },
            issuedDate: { gte: new Date('2026-01-01'), lte: new Date('2026-02-28') }
        },
        include: { matches: { include: { transaction: true } }, provider: true }
    });

    console.log("--- DTEs ---");
    folios.forEach(f => {
        console.log(`Folio: ${f.folio} | Monto: ${f.totalAmount} | Fecha: ${f.issuedDate.toISOString().split('T')[0]} | Proveedor: ${f.provider?.name}`);
        f.matches.forEach(m => {
            console.log(`  -> Match: ${m.status} | Tx: ${m.transaction?.date.toISOString().split('T')[0]} | Monto Tx: ${m.transaction?.amount}`);
        });
    });

    const txs = await prisma.bankTransaction.findMany({
        where: {
            date: { gte: new Date('2026-01-20'), lte: new Date('2026-02-10') },
            amount: { in: [189900, -189900] }
        },
        include: { matches: { include: { dte: true } } }
    });

    console.log("\n--- Transacciones de 189900 entre 20 Ene y 10 Feb ---");
    txs.forEach(t => {
        console.log(`Tx Date: ${t.date.toISOString().split('T')[0]} | Amount: ${t.amount} | Status: ${t.status} | Description: ${t.description}`);
        t.matches.forEach(m => {
            console.log(`  -> Match to DTE Folio: ${m.dte?.folio}`);
        });
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
