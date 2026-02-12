const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanMatches() {
    console.log('🧹 Limpieza forzada de matches vía Prisma...');
    try {
        const deleted = await prisma.reconciliationMatch.deleteMany({});
        console.log(`✅ Matches eliminados: ${deleted.count}`);
    } catch (e) {
        console.error('❌ Error al eliminar matches:', e);
    } finally {
        await prisma.$disconnect();
    }
}

cleanMatches();
