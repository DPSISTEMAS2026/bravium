/**
 * Script para cargar TODOS los DTEs del año 2025 desde LibreDTE
 * 
 * Este script carga mes por mes para evitar timeouts y problemas de memoria.
 * Útil para la carga inicial de todo el año.
 * 
 * Uso:
 *   node scripts/load_all_2025_dtes.js
 */

const https = require('https');
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_URL || ''; // Set BACKEND_URL in env for production
const YEAR = 2025;

// Meses del año
const MONTHS = [
    { num: 1, name: 'Enero', days: 31 },
    { num: 2, name: 'Febrero', days: 28 },
    { num: 3, name: 'Marzo', days: 31 },
    { num: 4, name: 'Abril', days: 30 },
    { num: 5, name: 'Mayo', days: 31 },
    { num: 6, name: 'Junio', days: 30 },
    { num: 7, name: 'Julio', days: 31 },
    { num: 8, name: 'Agosto', days: 31 },
    { num: 9, name: 'Septiembre', days: 30 },
    { num: 10, name: 'Octubre', days: 31 },
    { num: 11, name: 'Noviembre', days: 30 },
    { num: 12, name: 'Diciembre', days: 31 },
];

// Estadísticas globales
const stats = {
    totalMonths: 0,
    totalCreated: 0,
    totalSkipped: 0,
    totalErrors: 0,
    monthsSuccess: [],
    monthsFailed: [],
};

/**
 * Sincronizar un mes específico
 */
async function syncMonth(month) {
    return new Promise((resolve, reject) => {
        const fromDate = `${YEAR}-${String(month.num).padStart(2, '0')}-01`;
        const toDate = `${YEAR}-${String(month.num).padStart(2, '0')}-${String(month.days).padStart(2, '0')}`;

        console.log(`\n${'='.repeat(70)}`);
        console.log(`📅 Sincronizando ${month.name} ${YEAR}`);
        console.log(`   Rango: ${fromDate} a ${toDate}`);
        console.log(`${'='.repeat(70)}\n`);

        const payload = JSON.stringify({
            fromDate,
            toDate
        });

        const isHttps = BACKEND_URL.startsWith('https');
        const client = isHttps ? https : require('http');

        let host = BACKEND_URL.replace('https://', '').replace('http://', '');
        let port = isHttps ? 443 : 80;

        if (host.includes(':')) {
            const parts = host.split(':');
            host = parts[0];
            port = parseInt(parts[1]);
        }

        const options = {
            hostname: host,
            port: port,
            path: '/ingestion/libredte/sync',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = client.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                try {
                    const result = JSON.parse(responseBody);

                    if (result.status === 'success') {
                        console.log(`✅ ${month.name} - ÉXITO`);
                        console.log(`   Creados: ${result.data.created}`);
                        console.log(`   Omitidos: ${result.data.skipped}`);
                        console.log(`   Errores: ${result.data.errors}`);

                        stats.totalCreated += result.data.created;
                        stats.totalSkipped += result.data.skipped;
                        stats.totalErrors += result.data.errors;
                        stats.monthsSuccess.push(month.name);

                        resolve(result.data);
                    } else {
                        console.log(`❌ ${month.name} - ERROR`);
                        console.log(`   Mensaje: ${result.message}`);
                        stats.monthsFailed.push(month.name);
                        reject(new Error(result.message));
                    }
                } catch (e) {
                    console.log(`❌ ${month.name} - ERROR DE PARSEO`);
                    console.log(`   Respuesta: ${responseBody.substring(0, 200)}`);
                    stats.monthsFailed.push(month.name);
                    reject(e);
                }
            });
        });

        req.on('error', (error) => {
            console.error(`❌ ${month.name} - ERROR DE CONEXIÓN`);
            console.error(`   ${error.message}`);
            stats.monthsFailed.push(month.name);
            reject(error);
        });

        req.write(payload);
        req.end();
    });
}

/**
 * Sincronizar todos los meses del año
 */
async function syncAllMonths() {
    console.log('\n' + '='.repeat(70));
    console.log(`🚀 INICIANDO CARGA DE TODO EL AÑO ${YEAR}`);
    console.log('='.repeat(70));
    console.log(`📡 Backend: ${BACKEND_URL}`);
    console.log(`📅 Meses a procesar: ${MONTHS.length}`);
    console.log('='.repeat(70));

    for (const month of MONTHS) {
        try {
            await syncMonth(month);
            stats.totalMonths++;

            // Pausa de 2 segundos entre meses para no sobrecargar
            console.log(`\n⏳ Esperando 2 segundos antes del siguiente mes...\n`);
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            console.error(`\n❌ Error en ${month.name}: ${error.message}\n`);
            // Continuar con el siguiente mes aunque falle uno
        }
    }

    // Resumen final
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESUMEN FINAL');
    console.log('='.repeat(70));
    console.log(`\n✅ Meses procesados exitosamente: ${stats.monthsSuccess.length}/${MONTHS.length}`);
    if (stats.monthsSuccess.length > 0) {
        console.log(`   ${stats.monthsSuccess.join(', ')}`);
    }

    if (stats.monthsFailed.length > 0) {
        console.log(`\n❌ Meses con errores: ${stats.monthsFailed.length}`);
        console.log(`   ${stats.monthsFailed.join(', ')}`);
    }

    console.log(`\n📈 ESTADÍSTICAS TOTALES:`);
    console.log(`   Total DTEs creados: ${stats.totalCreated}`);
    console.log(`   Total DTEs omitidos (duplicados): ${stats.totalSkipped}`);
    console.log(`   Total errores: ${stats.totalErrors}`);
    console.log(`   Total procesados: ${stats.totalCreated + stats.totalSkipped}`);

    console.log('\n' + '='.repeat(70));

    if (stats.totalCreated > 0) {
        console.log('\n💡 PRÓXIMOS PASOS:');
        console.log('   1. Verifica los datos en el dashboard:');
        console.log('      GET /conciliacion/dashboard?year=2025');
        console.log('\n   2. Ejecuta el auto-match:');
        console.log('      POST /conciliacion/run-auto-match');
        console.log('      Body: {"fromDate": "2025-01-01", "toDate": "2025-12-31"}');
        console.log('\n   3. Exporta los datos a Excel:');
        console.log('      GET /conciliacion/export/excel?type=all&year=2025');
    }

    console.log('\n' + '='.repeat(70));
}

// Ejecutar
syncAllMonths()
    .then(() => {
        console.log('\n✅ Proceso completado exitosamente\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error fatal:', error.message);
        process.exit(1);
    });
