import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Buscando DTEs de 2026 huerfanos (PAID pero sin matches):");
    const orphanedDtes = await prisma.dTE.findMany({
        where: {
            issuedDate: { gte: new Date('2026-01-01') },
            // paymentStatus: 'PAID', // Wait, maybe they are just outstandingAmount = 0
            matches: { none: {} },
            OR: [
                { paymentStatus: 'PAID' },
                { outstandingAmount: 0 }
            ]
        }
    });

    console.log(`Hay ${orphanedDtes.length} DTEs de 2026 huérfanos.`);
    
    // Also lets check how many BankTransactions are PARTIALLY_MATCHED without matches
    const orphanedTxs = await prisma.bankTransaction.findMany({
        where: {
            date: { gte: new Date('2026-01-01') },
            status: { in: ['MATCHED', 'PARTIALLY_MATCHED'] },
            matches: { none: {} }
        }
    });
    
    console.log(`Hay ${orphanedTxs.length} Transacciones bancarias engañadas (Status pero sin matches).`);

    await prisma.$disconnect();
}
main().catch(console.error);
