/**
 * Script para probar el Dashboard de Conciliación en Producción
 * 
 * Prueba los nuevos endpoints desplegados en Render
 */

const https = require('https');

const BACKEND_URL = 'bravium-backend.onrender.com';

console.log('🧪 PRUEBA DE DASHBOARD EN PRODUCCIÓN');
console.log('='.repeat(70));
console.log(`🌐 Backend: https://${BACKEND_URL}`);
console.log('='.repeat(70));

function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BACKEND_URL,
            port: 443,
            path: path,
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            timeout: 30000
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

async function testEndpoints() {
    const tests = [
        {
            name: 'Health Check',
            path: '/health',
            description: 'Verificar que el backend esté funcionando'
        },
        {
            name: 'Dashboard Completo',
            path: '/conciliacion/dashboard',
            description: 'Dashboard sin filtros de fecha'
        },
        {
            name: 'Dashboard Enero 2026',
            path: '/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31',
            description: 'Dashboard filtrado por enero 2026'
        },
        {
            name: 'Overview Legacy',
            path: '/conciliacion/overview',
            description: 'Endpoint legacy de overview'
        }
    ];

    console.log('\n📋 EJECUTANDO PRUEBAS...\n');

    for (const test of tests) {
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`🧪 ${test.name}`);
        console.log(`   ${test.description}`);
        console.log(`   GET ${test.path}`);
        console.log(`${'─'.repeat(70)}`);

        try {
            const response = await makeRequest(test.path);

            if (response.statusCode === 200) {
                console.log(`✅ Status: ${response.statusCode} OK`);

                try {
                    const json = JSON.parse(response.body);
                    console.log(`📊 Respuesta:`);

                    // Mostrar resumen según el endpoint
                    if (test.path.includes('dashboard')) {
                        if (json.summary) {
                            console.log(`\n   📈 Transacciones:`);
                            console.log(`      Total: ${json.summary.transactions?.total || 0}`);
                            console.log(`      Matched: ${json.summary.transactions?.matched || 0}`);
                            console.log(`      Pending: ${json.summary.transactions?.pending || 0}`);
                            console.log(`      Match Rate: ${json.summary.transactions?.match_rate || '0%'}`);

                            console.log(`\n   📄 DTEs:`);
                            console.log(`      Total: ${json.summary.dtes?.total || 0}`);
                            console.log(`      Paid: ${json.summary.dtes?.paid || 0}`);
                            console.log(`      Unpaid: ${json.summary.dtes?.unpaid || 0}`);
                            console.log(`      Payment Rate: ${json.summary.dtes?.payment_rate || '0%'}`);

                            console.log(`\n   🔗 Matches:`);
                            console.log(`      Total: ${json.summary.matches?.total || 0}`);
                            console.log(`      Automatic: ${json.summary.matches?.automatic || 0}`);
                            console.log(`      Manual: ${json.summary.matches?.manual || 0}`);
                            console.log(`      Auto Rate: ${json.summary.matches?.auto_rate || '0%'}`);
                        } else {
                            console.log(`   ${JSON.stringify(json, null, 2).substring(0, 500)}...`);
                        }
                    } else {
                        console.log(`   ${JSON.stringify(json, null, 2).substring(0, 300)}...`);
                    }
                } catch (e) {
                    console.log(`   ${response.body.substring(0, 200)}...`);
                }
            } else {
                console.log(`⚠️  Status: ${response.statusCode}`);
                console.log(`   ${response.body.substring(0, 200)}`);
            }

        } catch (error) {
            console.log(`❌ Error: ${error.message}`);

            if (error.message.includes('ENOTFOUND')) {
                console.log(`   El backend no está accesible. ¿Está desplegado?`);
            } else if (error.message.includes('timeout')) {
                console.log(`   El backend está tardando mucho. Puede estar iniciando.`);
            }
        }

        // Esperar un poco entre requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ PRUEBAS COMPLETADAS');
    console.log('='.repeat(70));
    console.log('\n💡 PRÓXIMOS PASOS:');
    console.log('   1. Si el dashboard funciona, sincronizar DTEs de Enero');
    console.log('   2. Ejecutar auto-match');
    console.log('   3. Ver resultados actualizados en dashboard');
    console.log('\n📚 Ver DASHBOARD_CONCILIACION.md para más detalles');
    console.log('='.repeat(70));
}

// Ejecutar pruebas
console.log('\n⏳ Esperando 3 segundos antes de iniciar...\n');
setTimeout(() => {
    testEndpoints().catch(error => {
        console.error('\n❌ Error fatal:', error.message);
        process.exit(1);
    });
}, 3000);
