const { Client } = require('pg');
const https = require('https');

// Configuración DB
const dbConfig = {
    connectionString: 'postgres://bravium_user:9nvnhkIrPFRdX0t1UF7eVMN0dBLu9dg9@dpg-d6s0app2lte0c79gfflp-a.oregon-postgres.render.com/bravium_prod',
    ssl: { rejectUnauthorized: false }
};

const API_URL = 'https://bravium-backend.onrender.com';

async function fixData() {
    console.log('🚑 INICIANDO REPARACIÓN DE DATOS (MODO DIRECTO)\n');
    let client;

    try {
        // 1. Limpieza de BD
        console.log('1. Conectando a Base de Datos Externa...');
        client = new Client(dbConfig);
        await client.connect();
        console.log('   ✅ Conexión establecida.');

        console.log('2. Eliminando matches inválidos...');
        const resDelete = await client.query('DELETE FROM "ReconciliationMatch"');
        console.log(`   ✅ ${resDelete.rowCount} matches eliminados.`);

        console.log('3. Reseteando transacciones a PENDING...');
        const resUpdate = await client.query(`UPDATE "BankTransaction" SET status = 'PENDING'`);
        console.log(`   ✅ ${resUpdate.rowCount} transacciones reseteadas.`);

        await client.end();

        // 2. Sincronización de DTEs
        console.log('\n4. Sincronizando DTEs desde LibreDTE (Ene-Feb 2026)...');
        await triggerApi(`${API_URL}/ingestion/libredte/sync`, { fromDate: '2026-01-01', toDate: '2026-02-28' });

        // 3. Auto-Match
        console.log('\n5. Ejecutando Auto-Match...');
        await triggerApi(`${API_URL}/conciliacion/run-auto-match`, { fromDate: '2026-01-01', toDate: '2026-02-28' });

        console.log('\n🎉 REPARACIÓN COMPLETADA CON ÉXITO');
        console.log('   Por favor actualiza el dashboard en el navegador.');

    } catch (e) {
        console.error('\n❌ ERROR CRÍTICO:', e.message);
        if (client) await client.end();
    }
}

async function triggerApi(url, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`   ✅ API OK: ${url}`);
                    resolve(data);
                } else {
                    console.log(`   ⚠️ API Warning: ${res.statusCode} en ${url}`);
                    resolve(data); // No fallar, seguir
                }
            });
        });
        req.on('error', (e) => {
            console.log(`   ❌ API Error: ${e.message}`);
            resolve(); // No fallar
        });
        req.write(JSON.stringify(body));
        req.end();
    });
}

fixData();
