const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
    try {
        console.log('Verificando datos en DB...');

        // Intentar buscar DTEs
        const dteCount = await prisma.dTE.count();
        console.log(`✅ Total DTEs encontrados: ${dteCount}`);

        if (dteCount > 0) {
            const sample = await prisma.dTE.findFirst();
            console.log('Ejemplo DTE:', JSON.stringify(sample, null, 2));
        }

        // Intentar buscar Transacciones Bancarias
        const txCount = await prisma.bankTransaction.count();
        console.log(`✅ Total Transacciones Bancarias: ${txCount}`);

    } catch (error) {
        console.error('❌ Error verificando datos:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkData();
