/**
 * Script CORRECTO para acceder a la API de LibreDTE
 * 
 * Según la documentación oficial, cuando usas el hash de usuario (no el hash del contribuyente),
 * DEBES incluir el parámetro _contribuyente_rut en la URL
 * 
 * Formato correcto:
 * POST /api/dte/dte_recibidos/buscar/{emisor}?_contribuyente_rut={tu_rut}
 */

const https = require('https');

const API_KEY = 'WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==';
const RUT = '77154188'; // RUT del contribuyente
const authToken = API_KEY;

console.log('🎯 ACCESO CORRECTO A LA API DE LIBREDTE');
console.log('    (usando parámetro _contribuyente_rut)\n');
console.log('='.repeat(70));

function makeRequest(method, path, body = null, description = '') {
    return new Promise((resolve) => {
        const data = body ? JSON.stringify(body) : null;

        const options = {
            hostname: 'libredte.cl',
            port: 443,
            path: path,
            method: method,
            headers: {
                'Authorization': `Basic ${authToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'BRAVIUM/1.0'
            },
            timeout: 10000
        };

        if (data) {
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }

        console.log(`\n${'─'.repeat(70)}`);
        console.log(`📡 ${description}`);
        console.log(`   ${method} ${path}`);
        if (data) {
            const payload = JSON.parse(data);
            console.log(`   📦 Payload:`, JSON.stringify(payload, null, 2).split('\n').map(l => '      ' + l).join('\n').trim());
        }

        const req = https.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                const status = res.statusCode;
                const emoji = status === 200 ? '✅' : status === 402 ? '🔒' : status === 404 ? '❓' : status === 401 ? '🚫' : status === 406 ? '⚠️' : '⚠️';

                console.log(`${emoji} Status: ${status} ${res.statusMessage}`);

                try {
                    const parsed = JSON.parse(responseBody);

                    if (status === 200) {
                        // Mostrar respuesta exitosa
                        if (Array.isArray(parsed)) {
                            console.log(`   ✅ ¡ÉXITO! Array con ${parsed.length} elementos`);
                            if (parsed.length > 0) {
                                console.log(`   📄 Primer elemento:`, JSON.stringify(parsed[0], null, 2).split('\n').slice(0, 15).map(l => '      ' + l).join('\n').trim());
                                if (parsed.length > 1) {
                                    console.log(`      ... y ${parsed.length - 1} elementos más`);
                                }
                            } else {
                                console.log(`   📄 Array vacío (no hay datos en el rango solicitado)`);
                            }
                        } else {
                            console.log(`   ✅ ¡ÉXITO! Respuesta:`, JSON.stringify(parsed, null, 2).split('\n').slice(0, 20).map(l => '      ' + l).join('\n').trim());
                        }
                    } else {
                        // Mostrar error
                        console.log(`   ❌ Error:`, typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2).split('\n').map(l => '      ' + l).join('\n').trim());
                    }
                } catch (e) {
                    if (responseBody.length > 0) {
                        console.log(`   📄 Response (raw):`, responseBody.substring(0, 300));
                    }
                }

                resolve({ status, body: responseBody, path, method });
            });
        });

        req.on('error', (error) => {
            console.log(`❌ Error de red: ${error.message}`);
            resolve({ status: 0, path, method });
        });

        req.on('timeout', () => {
            req.destroy();
            console.log(`⏱️  Timeout (10s)`);
            resolve({ status: 0, path, method });
        });

        if (data) req.write(data);
        req.end();
    });
}

async function fetchLibreDTEData() {
    // Test 1: DTEs Recibidos con parámetro _contribuyente_rut
    await makeRequest(
        'POST',
        `/api/dte/dte_recibidos/buscar/${RUT}?_contribuyente_rut=${RUT}`,
        {
            fecha_desde: '2026-01-01',
            fecha_hasta: '2026-02-11',
            limit: 10
        },
        'Buscar DTEs Recibidos (con _contribuyente_rut)'
    );

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: DTEs Emitidos con parámetro _contribuyente_rut
    await makeRequest(
        'POST',
        `/api/dte/dte_emitidos/buscar/${RUT}?_contribuyente_rut=${RUT}`,
        {
            fecha_desde: '2026-01-01',
            fecha_hasta: '2026-02-11',
            limit: 10
        },
        'Buscar DTEs Emitidos (con _contribuyente_rut)'
    );

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 3: Documentos Temporales
    await makeRequest(
        'POST',
        `/api/dte/dte_tmps/buscar/${RUT}?_contribuyente_rut=${RUT}`,
        {
            limit: 10
        },
        'Buscar Documentos Temporales (con _contribuyente_rut)'
    );

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 4: Registro de Compras
    await makeRequest(
        'POST',
        `/api/dte/registro_compras/buscar/${RUT}?_contribuyente_rut=${RUT}`,
        {
            periodo: '2026-01'
        },
        'Registro de Compras Enero 2026 (con _contribuyente_rut)'
    );

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 5: Intercambios
    await makeRequest(
        'POST',
        `/api/dte/dte_intercambios/buscar/${RUT}?_contribuyente_rut=${RUT}`,
        {
            fecha_desde: '2026-01-01',
            fecha_hasta: '2026-02-11',
            limit: 10
        },
        'Buscar Intercambios (con _contribuyente_rut)'
    );

    console.log('\n' + '='.repeat(70));
    console.log('✅ PRUEBAS COMPLETADAS');
    console.log('='.repeat(70));
    console.log('\n💡 Según la documentación oficial de LibreDTE:');
    console.log('   El parámetro _contribuyente_rut es OBLIGATORIO cuando usas');
    console.log('   el hash de usuario (no el hash del contribuyente).');
    console.log('\n   Si aún recibes 402, verifica que el contribuyente tenga');
    console.log('   un plan que incluya acceso a la API.');
    console.log('='.repeat(70));
}

fetchLibreDTEData();
