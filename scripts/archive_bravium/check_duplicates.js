const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDuplicates() {
    console.log('🔍 Verificando duplicados en la base de datos...\n');

    // 1. Transacciones duplicadas
    const duplicateTransactions = await prisma.$queryRaw`
        SELECT 
            "date", 
            "description", 
            "amount", 
            COUNT(*) as count
        FROM "BankTransaction"
        WHERE EXTRACT(YEAR FROM "date") = 2026 
        AND EXTRACT(MONTH FROM "date") = 1
        GROUP BY "date", "description", "amount"
        HAVING COUNT(*) > 1
    `;

    console.log('📊 Transacciones Duplicadas (Enero 2026):');
    console.log(`Total grupos duplicados: ${duplicateTransactions.length}`);
    if (duplicateTransactions.length > 0) {
        console.log('\nEjemplos:');
        duplicateTransactions.slice(0, 5).forEach(dup => {
            console.log(`  - ${dup.date.toISOString().split('T')[0]} | ${dup.description} | $${dup.amount} | Duplicado ${dup.count} veces`);
        });
    }

    // 2. DTEs duplicados
    const duplicateDTEs = await prisma.$queryRaw`
        SELECT 
            "folio", 
            "type", 
            "totalAmount",
            COUNT(*) as count
        FROM "DTE"
        WHERE EXTRACT(YEAR FROM "issuedDate") = 2026 
        AND EXTRACT(MONTH FROM "issuedDate") = 1
        GROUP BY "folio", "type", "totalAmount"
        HAVING COUNT(*) > 1
    `;

    console.log('\n📄 DTEs Duplicados (Enero 2026):');
    console.log(`Total grupos duplicados: ${duplicateDTEs.length}`);
    if (duplicateDTEs.length > 0) {
        console.log('\nEjemplos:');
        duplicateDTEs.slice(0, 5).forEach(dup => {
            console.log(`  - Folio ${dup.folio} | Tipo ${dup.type} | $${dup.totalAmount} | Duplicado ${dup.count} veces`);
        });
    }

    // 3. Matches duplicados
    const duplicateMatches = await prisma.$queryRaw`
        SELECT 
            "transactionId", 
            "dteId",
            COUNT(*) as count
        FROM "ReconciliationMatch"
        GROUP BY "transactionId", "dteId"
        HAVING COUNT(*) > 1
    `;

    console.log('\n🔗 Matches Duplicados:');
    console.log(`Total grupos duplicados: ${duplicateMatches.length}`);
    if (duplicateMatches.length > 0) {
        console.log('\nEjemplos:');
        duplicateMatches.slice(0, 5).forEach(dup => {
            console.log(`  - TX: ${dup.transactionId} | DTE: ${dup.dteId} | Duplicado ${dup.count} veces`);
        });
    }

    // 4. Resumen general
    console.log('\n📈 Resumen General (Enero 2026):');

    const totalTransactions = await prisma.bankTransaction.count({
        where: {
            date: {
                gte: new Date('2026-01-01'),
                lt: new Date('2026-02-01')
            }
        }
    });

    const totalDTEs = await prisma.dTE.count({
        where: {
            issuedDate: {
                gte: new Date('2026-01-01'),
                lt: new Date('2026-02-01')
            }
        }
    });

    const totalMatches = await prisma.reconciliationMatch.count();

    console.log(`  - Total Transacciones: ${totalTransactions}`);
    console.log(`  - Total DTEs: ${totalDTEs}`);
    console.log(`  - Total Matches: ${totalMatches}`);

    await prisma.$disconnect();
}

checkDuplicates().catch(console.error);
