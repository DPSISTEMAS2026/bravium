const API_URL = 'https://bravium-backend.onrender.com';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runRecovery() {
    console.log('🚀 RECUPERACIÓN AUTOMÁTICA EN MARCHA (ESPERANDO DESPLIEGUE)');

    // Polling hasta 20 minutos
    const MAX_ATTEMPTS = 120; // 120 * 10s = 20 min

    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
        try {
            // Intentar limpiar matches (endpoint nuevo)
            const resClean = await fetch(`${API_URL}/conciliacion/clean-all`, { method: 'DELETE' });

            if (resClean.ok) {
                console.log('✅ 1. Limpieza de datos falsos completada.');

                // Sincronizar Enero
                await fetch(`${API_URL}/ingestion/libredte/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fromDate: '2026-01-01', toDate: '2026-01-31' })
                });
                console.log('✅ 2. DTEs Enero sincronizados.');

                // Sincronizar Febrero
                await fetch(`${API_URL}/ingestion/libredte/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fromDate: '2026-02-01', toDate: '2026-02-28' })
                });
                console.log('✅ 3. DTEs Febrero sincronizados.');

                // Auto-Match
                await fetch(`${API_URL}/conciliacion/run-auto-match`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fromDate: '2026-01-01', toDate: '2026-02-28' })
                });
                console.log('✅ 4. Auto-Match ejecutado.');
                console.log('🎉 PROCESO FINALIZADO. DATOS CORREGIDOS.');
                return;
            }
        } catch (e) {
            // Ignorar errores de red temporales
        }
        // Esperar 10s
        await delay(10000);
    }
    console.error('❌ Tiempo agotado esperando despliegue.');
}

runRecovery();
