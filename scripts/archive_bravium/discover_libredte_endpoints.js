/**
 * Script para descubrir qué endpoints están disponibles en tu plan de LibreDTE
 * 
 * Probará diferentes endpoints para ver cuáles responden con 200 vs 402
 */

const https = require('https');

const API_KEY = 'WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==';
const RUT = '77154188';
const authToken = API_KEY;

console.log('🔍 DESCUBRIENDO ENDPOINTS DISPONIBLES EN TU PLAN\n');

function makeRequest(method, path, body = null) {
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
            timeout: 5000
        };

        if (data) {
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }

        const req = https.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                const status = res.statusCode;
                const emoji = status === 200 ? '✅' : status === 402 ? '🔒' : status === 404 ? '❓' : '⚠️';

                console.log(`${emoji} [${status}] ${method.padEnd(6)} ${path}`);

                if (status === 200) {
                    try {
                        const parsed = JSON.parse(responseBody);
                        console.log(`   📄 Response:`, JSON.stringify(parsed).substring(0, 100) + '...');
                    } catch (e) {
                        console.log(`   📄 Response:`, responseBody.substring(0, 100) + '...');
                    }
                }

                resolve({ status, path, method });
            });
        });

        req.on('error', () => {
            console.log(`❌ ERROR  ${method.padEnd(6)} ${path}`);
            resolve({ status: 0, path, method });
        });

        req.on('timeout', () => {
            req.destroy();
            console.log(`⏱️  TIMEOUT ${method.padEnd(6)} ${path}`);
            resolve({ status: 0, path, method });
        });

        if (data) req.write(data);
        req.end();
    });
}

async function testEndpoints() {
    const endpoints = [
        // Endpoints de información básica
        { method: 'GET', path: `/api/dte/contribuyentes/info/${RUT}` },
        { method: 'GET', path: `/api/dte/contribuyentes/actividades_economicas/${RUT}` },

        // Endpoints de documentos emitidos
        { method: 'GET', path: `/api/dte/dte_emitidos/listar/${RUT}` },
        { method: 'POST', path: `/api/dte/dte_emitidos/buscar/${RUT}`, body: { limit: 5 } },

        // Endpoints de documentos recibidos
        { method: 'GET', path: `/api/dte/dte_recibidos/listar/${RUT}` },
        { method: 'POST', path: `/api/dte/dte_recibidos/buscar/${RUT}`, body: { limit: 5 } },

        // Endpoints de documentos temporales
        { method: 'GET', path: `/api/dte/dte_tmps/listar/${RUT}` },
        { method: 'POST', path: `/api/dte/dte_tmps/buscar/${RUT}`, body: { limit: 5 } },

        // Endpoints de intercambio
        { method: 'GET', path: `/api/dte/dte_intercambios/listar/${RUT}` },
        { method: 'POST', path: `/api/dte/dte_intercambios/buscar/${RUT}`, body: { limit: 5 } },

        // Endpoints de libros
        { method: 'GET', path: `/api/dte/registro_ventas/resumen/${RUT}/202601` },
        { method: 'GET', path: `/api/dte/registro_compras/resumen/${RUT}/202601` },

        // Endpoints de folios
        { method: 'GET', path: `/api/dte/dte_folios/disponibles/${RUT}` },

        // Endpoints de utilidades
        { method: 'GET', path: `/api/utilidades/contribuyentes/situacion_tributaria/rut/${RUT}` },
        { method: 'GET', path: `/api/utilidades/contribuyentes/situacion_tributaria/rut/${RUT}/1` },
    ];

    const results = {
        available: [],
        restricted: [],
        notFound: [],
        error: []
    };

    for (const endpoint of endpoints) {
        const result = await makeRequest(endpoint.method, endpoint.path, endpoint.body);

        if (result.status === 200) {
            results.available.push(`${endpoint.method} ${endpoint.path}`);
        } else if (result.status === 402) {
            results.restricted.push(`${endpoint.method} ${endpoint.path}`);
        } else if (result.status === 404) {
            results.notFound.push(`${endpoint.method} ${endpoint.path}`);
        } else {
            results.error.push(`${endpoint.method} ${endpoint.path}`);
        }

        // Pequeña pausa entre requests
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 RESUMEN DE RESULTADOS');
    console.log('='.repeat(70));

    console.log(`\n✅ ENDPOINTS DISPONIBLES (${results.available.length}):`);
    results.available.forEach(e => console.log(`   - ${e}`));

    console.log(`\n🔒 ENDPOINTS RESTRINGIDOS POR PLAN (${results.restricted.length}):`);
    results.restricted.forEach(e => console.log(`   - ${e}`));

    if (results.notFound.length > 0) {
        console.log(`\n❓ ENDPOINTS NO ENCONTRADOS (${results.notFound.length}):`);
        results.notFound.forEach(e => console.log(`   - ${e}`));
    }

    if (results.error.length > 0) {
        console.log(`\n❌ ENDPOINTS CON ERROR (${results.error.length}):`);
        results.error.forEach(e => console.log(`   - ${e}`));
    }

    console.log('\n' + '='.repeat(70));
    console.log('💡 RECOMENDACIÓN:');
    if (results.available.length > 0) {
        console.log('   Usa los endpoints disponibles marcados con ✅');
    } else {
        console.log('   Contacta a LibreDTE para verificar tu plan y acceso a la API');
        console.log('   Es posible que necesites actualizar tu plan para acceder a la API');
    }
    console.log('='.repeat(70));
}

testEndpoints();
