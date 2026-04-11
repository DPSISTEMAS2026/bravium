/**
 * Script para diagnosticar el problema de acceso a la API de LibreDTE
 * 
 * Tienes permisos /api/dte/* pero recibes 402. Esto puede ser porque:
 * 1. El contribuyente no está configurado correctamente
 * 2. Necesitas usar un endpoint diferente
 * 3. El RUT necesita incluir el DV
 */

const https = require('https');

const API_KEY = 'WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==';
const RUT_SIN_DV = '77154188';
const RUT_CON_DV = '77154188-7';
const authToken = API_KEY;

console.log('🔍 DIAGNÓSTICO DE ACCESO A LA API DE LIBREDTE\n');

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
            timeout: 5000
        };

        if (data) {
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }

        console.log(`\n${'─'.repeat(70)}`);
        console.log(`📡 ${description}`);
        console.log(`   ${method} ${path}`);
        if (data) {
            console.log(`   Payload:`, JSON.stringify(JSON.parse(data), null, 2).split('\n').map(l => '   ' + l).join('\n').trim());
        }

        const req = https.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                const status = res.statusCode;
                const emoji = status === 200 ? '✅' : status === 402 ? '🔒' : status === 404 ? '❓' : status === 401 ? '🚫' : '⚠️';

                console.log(`${emoji} Status: ${status} ${res.statusMessage}`);

                try {
                    const parsed = JSON.parse(responseBody);
                    console.log(`   Response:`, JSON.stringify(parsed, null, 2).split('\n').map(l => '   ' + l).join('\n').trim());
                } catch (e) {
                    if (responseBody.length > 0) {
                        console.log(`   Response:`, responseBody.substring(0, 200));
                    }
                }

                resolve({ status, body: responseBody, path, method });
            });
        });

        req.on('error', (error) => {
            console.log(`❌ Error: ${error.message}`);
            resolve({ status: 0, path, method });
        });

        req.on('timeout', () => {
            req.destroy();
            console.log(`⏱️  Timeout`);
            resolve({ status: 0, path, method });
        });

        if (data) req.write(data);
        req.end();
    });
}

async function runDiagnostics() {
    console.log('PARTE 1: Verificar acceso al perfil de usuario\n');

    // Test 1: Perfil de usuario (debería funcionar según tus permisos)
    await makeRequest(
        'GET',
        '/api/usuarios/perfil',
        null,
        'Test 1: Obtener perfil de usuario'
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('\n\nPARTE 2: Probar endpoints de DTE con RUT sin DV\n');

    // Test 2: Listar contribuyentes (sin especificar RUT)
    await makeRequest(
        'GET',
        '/api/dte/contribuyentes',
        null,
        'Test 2: Listar contribuyentes disponibles'
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 3: DTEs emitidos sin RUT en URL
    await makeRequest(
        'POST',
        '/api/dte/dte_emitidos/buscar',
        {
            emisor: RUT_SIN_DV,
            fecha_desde: '2026-01-01',
            fecha_hasta: '2026-02-11',
            limit: 5
        },
        'Test 3: Buscar DTEs emitidos (RUT en body sin DV)'
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 4: DTEs recibidos sin RUT en URL
    await makeRequest(
        'POST',
        '/api/dte/dte_recibidos/buscar',
        {
            receptor: RUT_SIN_DV,
            fecha_desde: '2026-01-01',
            fecha_hasta: '2026-02-11',
            limit: 5
        },
        'Test 4: Buscar DTEs recibidos (RUT en body sin DV)'
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('\n\nPARTE 3: Probar endpoints de DTE con RUT con DV\n');

    // Test 5: DTEs emitidos con DV
    await makeRequest(
        'POST',
        '/api/dte/dte_emitidos/buscar',
        {
            emisor: RUT_CON_DV,
            fecha_desde: '2026-01-01',
            fecha_hasta: '2026-02-11',
            limit: 5
        },
        'Test 5: Buscar DTEs emitidos (RUT en body con DV)'
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 6: DTEs recibidos con DV
    await makeRequest(
        'POST',
        '/api/dte/dte_recibidos/buscar',
        {
            receptor: RUT_CON_DV,
            fecha_desde: '2026-01-01',
            fecha_hasta: '2026-02-11',
            limit: 5
        },
        'Test 6: Buscar DTEs recibidos (RUT en body con DV)'
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('\n\nPARTE 4: Probar endpoints alternativos\n');

    // Test 7: Documentos (endpoint genérico)
    await makeRequest(
        'GET',
        `/api/dte/documentos?receptor=${RUT_SIN_DV}&limit=5`,
        null,
        'Test 7: Listar documentos (query string sin DV)'
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 8: Documentos con DV
    await makeRequest(
        'GET',
        `/api/dte/documentos?receptor=${RUT_CON_DV}&limit=5`,
        null,
        'Test 8: Listar documentos (query string con DV)'
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 9: Registro de compras
    await makeRequest(
        'POST',
        '/api/dte/registro_compras/buscar',
        {
            receptor: RUT_SIN_DV,
            periodo: '2026-01'
        },
        'Test 9: Registro de compras (sin RUT en URL)'
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 10: Registro de ventas
    await makeRequest(
        'POST',
        '/api/dte/registro_ventas/buscar',
        {
            emisor: RUT_SIN_DV,
            periodo: '2026-01'
        },
        'Test 10: Registro de ventas (sin RUT en URL)'
    );

    console.log('\n' + '='.repeat(70));
    console.log('📊 DIAGNÓSTICO COMPLETADO');
    console.log('='.repeat(70));
    console.log('\n💡 Revisa los resultados arriba para ver qué endpoints funcionan.');
    console.log('   Si todos dan 402, contacta a soporte de LibreDTE.');
    console.log('='.repeat(70));
}

runDiagnostics();
