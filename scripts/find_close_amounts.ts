import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Buscando Montos Cercanos a 419940 (±$100) ---');
    
    const transactions = await prisma.bankTransaction.findMany({
        where: {
            OR: [
                { amount: { gte: 419840, lte: 420040 } },
                { amount: { gte: -420040, lte: -419840 } }
            ]
        },
        include: { bankAccount: true }
    });

    if (transactions.length === 0) {
        console.log('No se encontraron movimientos en ese rango de monto.');
    } else {
        transactions.forEach(tx => {
            console.log(`[${tx.date.toISOString().split('T')[0]}] ${tx.bankAccount.bankName} (${tx.bankAccount.accountNumber}) | $${tx.amount} | ${tx.description} | Status: ${tx.status}`);
        });
    }

    console.log('\n--- Buscando DTEs cercanos a 419940 (±$100) ---');
    const dtes = await prisma.dTE.findMany({
        where: {
            totalAmount: { gte: 419840, lte: 420040 }
        },
        include: { provider: true }
    });
    
    dtes.forEach(d => {
        console.log(`- Folio ${d.folio} | API: ${d.rutIssuer} | Emisor: ${d.provider?.name} | Fecha: ${d.issuedDate.toISOString().split('T')[0]} | Status: ${d.paymentStatus} | Amount: ${d.totalAmount}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
