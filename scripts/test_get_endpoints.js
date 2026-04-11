/**
 * Último intento: Probar endpoints GET que podrían estar disponibles
 * según la documentación de LibreDTE
 */

const https = require('https');

const API_KEY = 'WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==';
const RUT = '77154188';
const authToken = API_KEY;

console.log('🔍 PROBANDO ENDPOINTS GET (pueden tener menos restricciones)\n');

function makeRequest(method, path, description = '') {
    return new Promise((resolve) => {
        const options = {
            hostname: 'libredte.cl',
            port: 443,
            path: path,
            method: method,
            headers: {
                'Authorization': `Basic ${authToken}`,
                'Accept': 'application/json',
                'User-Agent': 'BRAVIUM/1.0'
            },
            timeout: 5000
        };

        console.log(`\n📡 ${description}`);
        console.log(`   ${method} ${path}`);

        const req = https.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                const status = res.statusCode;
                const emoji = status === 200 ? '✅' : '❌';

                console.log(`${emoji} Status: ${status}`);

                if (status === 200) {
                    try {
                        const parsed = JSON.parse(responseBody);
                        console.log(`   ✅ ¡FUNCIONA! Respuesta:`, JSON.stringify(parsed, null, 2).substring(0, 500));
                    } catch (e) {
                        console.log(`   ✅ ¡FUNCIONA! Respuesta (raw):`, responseBody.substring(0, 300));
                    }
                } else {
                    console.log(`   Error:`, responseBody.substring(0, 150));
                }

                resolve({ status, path });
            });
        });

        req.on('error', () => resolve({ status: 0, path }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, path }); });
        req.end();
    });
}

async function testGETEndpoints() {
    const tests = [
        // Perfil (sabemos que funciona)
        { path: '/api/usuarios/perfil', desc: 'Perfil de usuario (control)' },

        // Intentar listar sin buscar
        { path: `/api/dte/dte_recibidos/${RUT}`, desc: 'DTEs recibidos (GET directo)' },
        { path: `/api/dte/dte_emitidos/${RUT}`, desc: 'DTEs emitidos (GET directo)' },
        { path: `/api/dte/dte_tmps/${RUT}`, desc: 'DTEs temporales (GET directo)' },

        // Endpoints de resumen
        { path: `/api/dte/dte_ventas/resumen/${RUT}/2026-01`, desc: 'Resumen ventas enero' },
        { path: `/api/dte/dte_compras/resumen/${RUT}/2026-01`, desc: 'Resumen compras enero' },

        // Otros endpoints
        { path: `/api/dte/contribuyentes/${RUT}`, desc: 'Info contribuyente' },
        { path: `/api/dte/contribuyentes/${RUT}/config`, desc: 'Config contribuyente' },
    ];

    for (const test of tests) {
        await makeRequest('GET', test.path, test.desc);
        await new Promise(resolve => setTimeout(resolve, 400));
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 CONCLUSIÓN');
    console.log('='.repeat(70));
    console.log('\nSi NO hay endpoints con ✅ (excepto el perfil), entonces:');
    console.log('\n1. El contribuyente RUT 77154188 NO tiene acceso a la API habilitado');
    console.log('2. Aunque TU USUARIO tiene permisos /api/dte/*');
    console.log('3. Cada CONTRIBUYENTE debe tener su propio plan con API');
    console.log('\n💡 SOLUCIÓN:');
    console.log('   - Ve a LibreDTE > Contribuyentes > Selecciona 77154188');
    console.log('   - Verifica el plan del contribuyente');
    console.log('   - Actualiza el plan para incluir acceso a API');
    console.log('   - O contacta a soporte: soporte@libredte.cl');
    console.log('='.repeat(70));
}

testGETEndpoints();
