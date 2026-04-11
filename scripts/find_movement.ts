import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Buscando Movimiento Bancario ---');
    console.log('Monto: 419940');
    console.log('Fecha aprox: 20/03/2026');

    const transactions = await prisma.bankTransaction.findMany({
        where: {
            OR: [
                { amount: 419940 },
                { amount: -419940 }
            ]
        },
        include: {
            bankAccount: true,
            matches: {
                include: {
                    dte: true
                }
            }
        }
    });

    if (transactions.length === 0) {
        console.log('\n❌ No se encontró ningún movimiento exacto por 419,940.');
        
        // Buscar por rango de fecha para ver qué hay el 20/03
        console.log('\n--- Movimientos el 20/03/2026 ---');
        const march20 = new Date('2026-03-20');
        const march21 = new Date('2026-03-21');
        
        const dayTransactions = await prisma.bankTransaction.findMany({
            where: {
                date: {
                    gte: march20,
                    lt: march21
                }
            },
            include: { bankAccount: true }
        });
        
        dayTransactions.forEach(tx => {
            console.log(`[${tx.date.toISOString()}] ${tx.bankAccount.bankName} | ${tx.description} | $${tx.amount} | Status: ${tx.status}`);
        });

    } else {
        console.log(`\n✅ Se encontraron ${transactions.length} movimientos:`);
        transactions.forEach(tx => {
            console.log(`\nID: ${tx.id}`);
            console.log(`Fecha: ${tx.date.toISOString()}`);
            console.log(`Banco: ${tx.bankAccount.bankName} (${tx.bankAccount.accountNumber})`);
            console.log(`Descripción: ${tx.description}`);
            console.log(`Monto: $${tx.amount}`);
            console.log(`Estado: ${tx.status}`);
            if (tx.matches.length > 0) {
                console.log(`Matches:`);
                tx.matches.forEach(m => {
                    console.log(`  - DTE Folio: ${m.dte?.folio} (${m.status})`);
                });
            } else {
                console.log(`Sin matches.`);
            }
        });
    }

    // Buscar también DTEs con ese monto por si acaso
    console.log('\n--- Buscando DTEs con monto 419940 ---');
    const dtes = await prisma.dTE.findMany({
        where: { totalAmount: 419940 },
        include: { provider: true }
    });
    
    if (dtes.length > 0) {
        console.log(`Encontrados ${dtes.length} DTEs:`);
        dtes.forEach(d => {
            console.log(`- Folio ${d.folio} | API: ${d.rutIssuer} | Emisor: ${d.provider?.name} | Fecha: ${d.issuedDate.toISOString()} | Status: ${d.paymentStatus}`);
        });
    } else {
        console.log('No se encontraron DTEs con ese monto.');
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
