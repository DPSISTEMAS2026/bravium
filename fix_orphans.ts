import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Des-engañando DTEs huerfanos...");
    const orphanedDtes = await prisma.dTE.findMany({
        where: {
            issuedDate: { gte: new Date('2026-01-01') },
            matches: { none: {} },
            OR: [
                { paymentStatus: 'PAID' },
                { outstandingAmount: 0 }
            ]
        }
    });

    for (const dte of orphanedDtes) {
        await prisma.dTE.update({
            where: { id: dte.id },
            data: {
                paymentStatus: 'UNPAID',
                outstandingAmount: dte.totalAmount
            }
        });
    }
    console.log(`Corregidos ${orphanedDtes.length} DTEs devolviéndolos a UNPAID.`);

    console.log("Des-engañando Transacciones Bancarias...");
    const orphanedTxs = await prisma.bankTransaction.findMany({
        where: {
            date: { gte: new Date('2026-01-01') },
            status: { in: ['MATCHED', 'PARTIALLY_MATCHED'] },
            matches: { none: {} }
        }
    });

    for (const tx of orphanedTxs) {
        await prisma.bankTransaction.update({
            where: { id: tx.id },
            data: {
                status: 'PENDING'
            }
        });
    }
    console.log(`Corregidas ${orphanedTxs.length} transacciones bancarias devolviéndolas a PENDING.`);

    await prisma.$disconnect();
}
main().catch(console.error);
