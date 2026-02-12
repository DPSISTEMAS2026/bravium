// Script para limpiar matches duplicados/inválidos
const API_URL = 'https://bravium-backend.onrender.com';

async function cleanMatches() {
    console.log('🧹 LIMPIEZA DE MATCHES DUPLICADOS/INVÁLIDOS\n');
    console.log('⚠️  Este script eliminará TODOS los matches actuales');
    console.log('   Ya que no hay DTEs, todos los matches son inválidos\n');

    try {
        // Llamar al endpoint de limpieza (si existe) o crear uno
        console.log('🔄 Solicitando limpieza al backend...\n');

        const response = await fetch(`${API_URL}/conciliacion/matches/clean-all`, {
            method: 'DELETE'
        });

        if (response.ok) {
            const result = await response.json();
            console.log('✅ Limpieza exitosa');
            console.log(`   Matches eliminados: ${result.deleted || 'N/A'}`);
        } else {
            console.log(`❌ Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.log('Respuesta:', text);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n💡 SOLUCIÓN ALTERNATIVA:');
        console.log('   Ejecuta este SQL directamente en la base de datos:');
        console.log('   DELETE FROM "ReconciliationMatch";');
    }
}

cleanMatches();
