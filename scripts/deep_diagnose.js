
async function deepDiagnose() {
    const API_URL = 'https://bravium-backend.onrender.com';

    console.log('🔬 DIAGNÓSTICO PROFUNDO DE ENDPOINTS...\n');

    const tests = [
        { name: 'Health (Overview)', path: '/conciliacion/overview' },
        { name: 'Archivos Ingestados', path: '/conciliacion/files' },
        // Estos endpoints hipotéticos podrían no existir si no están expuestos en el controller
        // Pero intentaremos inferir salud indirectamente
    ];

    // 3. Test Dashboard Data (CRITICAL)
    console.log('\nTesting Dashboard Endpoint (Real Data Check)...');
    try {
        const dashRes = await fetch(`${API_URL}/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31`);
        if (dashRes.ok) {
            const data = await dashRes.json();
            console.log(`✅  Dashboard: OK (${dashRes.status})`);
            console.log(`   - Transactions Total: ${data.summary?.transactions?.total}`);
            console.log(`   - DTEs Total: ${data.summary?.dtes?.total}`);
            console.log(`   - Pending Transactions: ${data.pending?.transactions?.length}`);
            console.log(`   - Pending DTEs: ${data.pending?.dtes?.length}`);

            if (data.pending?.transactions?.length === 0) {
                console.warn('⚠️  WARNING: 0 Pending Transactions found. verifies if BankStatements are uploaded.');
            }
        } else {
            console.error(`❌  Dashboard: FAILED (${dashRes.status}) - ${dashRes.statusText}`);
            const text = await dashRes.text();
            console.error('   Error Body:', text.substring(0, 200));
        }
    } catch (error) {
        console.error('❌  Dashboard: ERROR (Fetch failed)', error.message);
    }
    console.log('---');

    for (const test of tests) {
        try {
            console.log(`Testing ${test.name}...`);
            const res = await fetch(`${API_URL}${test.path}`);
            if (res.ok) {
                console.log(`✅  ${test.name}: OK (${res.status})`);
                const data = await res.json();
                console.log(`   Items: ${Array.isArray(data) ? data.length : 'Object'}`);
            } else {
                console.error(`❌  ${test.name}: FAILED (${res.status})`);
                const txt = await res.text();
                console.log(`   Error: ${txt}`);
            }
        } catch (e) {
            console.error(`🚨  ${test.name}: EXCEPTION (${e.message})`);
        }
        console.log('---');
    }
}

deepDiagnose();
