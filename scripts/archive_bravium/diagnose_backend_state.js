
// Script de diagnóstico para verificar el estado real del backend
// Sin dependencias externas, usa fetch nativo de Node v18+

async function runDiagnostics() {
    const API_URL = 'https://bravium-backend.onrender.com';
    console.log(`🔍 Iniciando diagnóstico contra: ${API_URL}\n`);

    try {
        // 1. Health Check General
        console.log('1️⃣  Verificando Health Check (/conciliacion/overview)...');
        const healthRes = await fetch(`${API_URL}/conciliacion/overview`);
        if (!healthRes.ok) {
            console.error(`❌  Backend responde con error: ${healthRes.status} ${healthRes.statusText}`);
            const text = await healthRes.text();
            console.error(`   Detalle: ${text.substring(0, 200)}...`);
            return;
        }
        const overview = await healthRes.json();
        console.log('✅  Backend ONLINE');

        // 2. Verificar Dashboard completo (Enero 2026)
        console.log('\n2️⃣  Verificando Dashboard (Enero 2026)...');
        const dashRes = await fetch(`${API_URL}/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31`);
        if (!dashRes.ok) {
            console.error(`❌  Error al obtener dashboard: ${dashRes.status}`);
            const text = await dashRes.text();
            console.error(`   Detalle: ${text}`);
            return;
        }

        const dash = await dashRes.json();

        console.log('\n📊 ESTADÍSTICAS REALES:');
        console.log('----------------------------------------');
        console.log(`📄 DTEs (Facturas):      ${dash.summary.dtes.total}`);
        console.log(`💳 Transacciones Banco:  ${dash.summary.transactions.total}`);
        console.log(`🔗 Matches Confirmados:  ${dash.summary.matches.confirmed}`);
        console.log(`🤖 Matches Automáticos:  ${dash.summary.matches.automatic}`);
        console.log('----------------------------------------');

        // 3. Análisis de Cartolas
        if (dash.summary.transactions.total === 0) {
            console.warn('\n⚠️  ALERTA: El backend reporta 0 transacciones bancarias.');
            console.warn('   Posibles causas:');
            console.warn('   - No se han cargado en la BD de producción.');
            console.warn('   - La fecha de las cartolas no es Enero 2026.');

            // Intentar buscar en un rango más amplio por si acaso
            console.log('\n🔎 Buscando transacciones fuera de rango (2025-2026)...');
            const wideDashRes = await fetch(`${API_URL}/conciliacion/dashboard?fromDate=2025-01-01&toDate=2026-12-31`);
            const wideDash = await wideDashRes.json();
            console.log(`   Transacciones en todo 2025-2026: ${wideDash.summary.transactions.total}`);
        } else {
            console.log(`\n✅  Cartolas detectadas correctamente (${dash.summary.transactions.total}).`);
        }

    } catch (error) {
        console.error('\n🚨 Error de conexión o ejecución:', error.message);
    }
}

runDiagnostics();
