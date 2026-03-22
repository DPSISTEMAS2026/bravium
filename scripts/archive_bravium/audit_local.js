
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function auditLocal() {
    console.log('🔍 SISTEMA DE AUDITORIA BRAVIUM (LOCAL)\n');
    console.log('----------------------------------------');

    try {
        // 1. Verificar Conexión
        console.log('⏳ Probando conexión a la base de datos...');
        await prisma.$connect();
        console.log('✅ Conexión establecida.\n');

        // 2. Conteo de Entidades Principales
        console.log('📊 CONTEO DE DATOS:');

        const dtesCount = await prisma.dTE.count();
        const transactionsCount = await prisma.bankTransaction.count();
        const matchesCount = await prisma.reconciliationMatch.count();
        const providersCount = await prisma.provider.count();
        const usersCount = await prisma.user.count();

        console.log(`📄 DTEs (Facturas):      ${dtesCount}`);
        console.log(`💳 Transacciones Banco:  ${transactionsCount}`);
        console.log(`🔗 Matches:              ${matchesCount}`);
        console.log(`🏢 Proveedores:           ${providersCount}`);
        console.log(`👤 Usuarios:              ${usersCount}`);
        console.log('----------------------------------------\n');

        // 3. Auditoría de Salud de Datos
        console.log('🛠️ AUDITORÍA DE SALUD:');

        if (dtesCount > 0 && providersCount === 0) {
            console.warn('⚠️  ALERTA: Hay DTEs pero no hay proveedores creados.');
        }

        if (transactionsCount > 0 && dtesCount === 0) {
            console.warn('ℹ️  INFO: Se han cargado cartolas pero no se han sincronizado DTEs de LibreDTE.');
        }

        if (matchesCount > 0) {
            const minPossible = Math.min(dtesCount, transactionsCount);
            const coverage = minPossible > 0 ? (matchesCount / minPossible) * 100 : 0;
            console.log(`✅ Conciliación en progreso: ${coverage.toFixed(2)}% de cobertura.`);
        } else if (dtesCount > 0 && transactionsCount > 0) {
            console.warn('⚠️  ADVERTENCIA: Hay datos suficientes pero NO hay conciliaciones realizadas.');
        } else {
            console.log('✅ Sistema listo para importar datos.');
        }

        // 4. Verificar Variables Críticas
        console.log('\n🔐 CONFIGURACIÓN:');
        console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV}`);
        console.log(`🔌 COMPANY_RUT: ${process.env.COMPANY_RUT || 'NO DEFINIDO'}`);

        console.log('\n✅ Auditoría completada.');

    } catch (error) {
        console.error('\n❌ ERROR DURANTE LA AUDITORÍA:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

auditLocal();
