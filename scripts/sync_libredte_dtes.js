/**
 * Script para sincronizar DTEs desde LibreDTE a BRAVIUM
 * 
 * Uso:
 *   node scripts/sync_libredte_dtes.js [fecha_desde] [fecha_hasta]
 * 
 * Ejemplos:
 *   node scripts/sync_libredte_dtes.js 2026-01-01 2026-02-11
 *   node scripts/sync_libredte_dtes.js  (usa últimos 30 días)
 */

const https = require('https');

// Configuración
const API_KEY = 'WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==';
const COMPANY_RUT = '77154188';
const BACKEND_URL = process.env.BACKEND_URL || 'localhost:3000';

// Parsear argumentos de línea de comandos
const args = process.argv.slice(2);
let fromDate, toDate;

if (args.length >= 2) {
    fromDate = args[0];
    toDate = args[1];
} else {
    // Por defecto: últimos 30 días
    toDate = new Date().toISOString().split('T')[0];
    const from = new Date();
    from.setDate(from.getDate() - 30);
    fromDate = from.toISOString().split('T')[0];
}

console.log('🔄 SINCRONIZACIÓN DE DTEs DESDE LIBREDTE');
console.log('='.repeat(70));
console.log(`📅 Rango de fechas: ${fromDate} → ${toDate}`);
console.log(`🏢 RUT Empresa: ${COMPANY_RUT}`);
console.log(`🔗 Backend: ${BACKEND_URL}`);
console.log('='.repeat(70));

async function syncDtes() {
    try {
        console.log('\n📡 Enviando solicitud al backend...\n');

        const [host, port] = BACKEND_URL.split(':');
        const data = JSON.stringify({
            fromDate,
            toDate
        });

        const options = {
            hostname: host,
            port: port || 80,
            path: '/ingestion/libredte/sync',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = (port === '443' ? https : require('http')).request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                console.log(`📊 Status: ${res.statusCode}\n`);

                try {
                    const result = JSON.parse(responseBody);

                    if (result.status === 'success') {
                        console.log('✅ SINCRONIZACIÓN EXITOSA\n');
                        console.log(`   Total DTEs procesados: ${result.data.total}`);
                        console.log(`   ✅ Creados: ${result.data.created}`);
                        console.log(`   ⏭️  Omitidos (ya existían): ${result.data.skipped}`);
                        console.log(`   ❌ Errores: ${result.data.errors}`);
                    } else {
                        console.log('❌ ERROR EN LA SINCRONIZACIÓN\n');
                        console.log(`   Mensaje: ${result.message}`);
                        if (result.stack) {
                            console.log(`\n   Stack trace:\n${result.stack}`);
                        }
                    }
                } catch (e) {
                    console.log('📄 Respuesta (raw):', responseBody);
                }

                console.log('\n' + '='.repeat(70));
            });
        });

        req.on('error', (error) => {
            console.error('❌ Error de conexión:', error.message);
            console.log('\n💡 Asegúrate de que el backend esté corriendo:');
            console.log('   npm run start:dev');
        });

        req.write(data);
        req.end();

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

syncDtes();
