// Script para verificar todos los DTEs en la base de datos
const API_URL = 'https://bravium-backend.onrender.com';

async function checkAllData() {
    console.log('🔍 Verificando TODOS los datos en la base de datos...\n');

    try {
        // Verificar datos de 2025 (año completo)
        console.log('📅 Verificando año 2025:');
        const response2025 = await fetch(`${API_URL}/conciliacion/dashboard?year=2025`);
        const data2025 = await response2025.json();

        console.log(`   Transacciones: ${data2025.summary.transactions.total}`);
        console.log(`   DTEs: ${data2025.summary.dtes.total}`);
        console.log(`   Matches: ${data2025.summary.matches.total}\n`);

        // Verificar datos de 2026
        console.log('📅 Verificando año 2026:');
        const response2026 = await fetch(`${API_URL}/conciliacion/dashboard?year=2026`);
        const data2026 = await response2026.json();

        console.log(`   Transacciones: ${data2026.summary.transactions.total}`);
        console.log(`   DTEs: ${data2026.summary.dtes.total}`);
        console.log(`   Matches: ${data2026.summary.matches.total}\n`);

        // Verificar datos de 2024
        console.log('📅 Verificando año 2024:');
        const response2024 = await fetch(`${API_URL}/conciliacion/dashboard?year=2024`);
        const data2024 = await response2024.json();

        console.log(`   Transacciones: ${data2024.summary.transactions.total}`);
        console.log(`   DTEs: ${data2024.summary.dtes.total}`);
        console.log(`   Matches: ${data2024.summary.matches.total}\n`);

        // Resumen
        const totalDTEs = data2024.summary.dtes.total + data2025.summary.dtes.total + data2026.summary.dtes.total;
        const totalTransactions = data2024.summary.transactions.total + data2025.summary.transactions.total + data2026.summary.transactions.total;
        const totalMatches = data2024.summary.matches.total + data2025.summary.matches.total + data2026.summary.matches.total;

        console.log('📊 RESUMEN TOTAL:');
        console.log(`   Total DTEs en BD: ${totalDTEs}`);
        console.log(`   Total Transacciones en BD: ${totalTransactions}`);
        console.log(`   Total Matches en BD: ${totalMatches}\n`);

        if (totalDTEs === 0) {
            console.log('⚠️  NO HAY DTEs EN LA BASE DE DATOS');
            console.log('   Posibles causas:');
            console.log('   1. No se han sincronizado DTEs desde LibreDTE');
            console.log('   2. Hubo un error en la sincronización');
            console.log('   3. Las credenciales de LibreDTE no están configuradas\n');
        }

        if (totalMatches > totalDTEs || totalMatches > totalTransactions) {
            console.log('⚠️  HAY MATCHES DUPLICADOS');
            console.log(`   Matches: ${totalMatches}`);
            console.log(`   Máximo posible: ${Math.min(totalDTEs, totalTransactions)}`);
            console.log(`   Duplicados: ~${totalMatches - Math.min(totalDTEs, totalTransactions)}\n`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkAllData();
