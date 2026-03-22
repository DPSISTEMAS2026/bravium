async function checkData() {
    console.log('--- Verificando Datos Reales en Backend ---');
    try {
        const url = 'https://bravium-backend.onrender.com/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31';
        console.log(`URL: ${url}`);

        const res = await fetch(url);

        if (!res.ok) {
            console.error(`Error HTTP: ${res.status}`);
            const text = await res.text();
            console.error('Respuesta:', text);
            return;
        }

        const data = await res.json();
        console.log('\n✅ CONTEO DE DATOS:');
        console.log(`- Transacciones: ${data.summary.transactions.total}`);
        console.log(`- DTEs:          ${data.summary.dtes.total}`);
        console.log(`- Matches:       ${data.summary.matches.total}`);
        console.log(`- Monto DTEs Pendiente: ${data.summary.dtes.outstanding_amount}`);

        if (data.pending.transactions.length > 0) {
            console.log('\n✅ Transacciones Pendientes Encontradas (Top 1):');
            console.log(JSON.stringify(data.pending.transactions[0], null, 2));
        } else {
            console.log('\n⚠️ NO se encontraron transacciones pendientes en el periodo.');
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

checkData();
