/**
 * Script de prueba para verificar conexión con LibreDTE API
 * 
 * Según la documentación de LibreDTE, la autenticación se hace con:
 * Authorization: Basic BASE64(X:APIHASH)
 * 
 * Donde X es cualquier caracter y APIHASH es el hash de tu perfil de usuario
 */

const https = require('https');

// CONFIGURACIÓN
const API_KEY = 'WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA=='; // API KEY (ya está en Base64)
const RUT = '77154188'; // Tu RUT sin DV

// El API KEY ya viene en formato Base64(X:APIHASH), así que lo usamos directamente
const authToken = API_KEY;

console.log('='.repeat(60));
console.log('PRUEBA DE CONEXIÓN A LIBREDTE API');
console.log('='.repeat(60));
console.log(`RUT: ${RUT}`);
console.log(`Auth Token: Basic ${authToken.substring(0, 20)}...`);
console.log('='.repeat(60));

/**
 * Función para hacer requests a la API
 */
function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
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
            }
        };

        if (data) {
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }

        console.log(`\n${'─'.repeat(60)}`);
        console.log(`📡 ${method} ${path}`);
        if (data) {
            console.log(`📦 Payload:`, JSON.stringify(JSON.parse(data), null, 2));
        }

        const req = https.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                console.log(`📊 Status: ${res.statusCode} ${res.statusMessage}`);

                // Intentar parsear como JSON
                let parsedBody;
                try {
                    parsedBody = JSON.parse(responseBody);
                    console.log(`✅ Response:`, JSON.stringify(parsedBody, null, 2));
                } catch (e) {
                    console.log(`📄 Response (raw):`, responseBody.substring(0, 500));
                }

                resolve({
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage,
                    headers: res.headers,
                    body: parsedBody || responseBody
                });
            });
        });

        req.on('error', (error) => {
            console.error(`❌ Error:`, error.message);
            reject(error);
        });

        if (data) {
            req.write(data);
        }

        req.end();
    });
}

/**
 * Ejecutar pruebas
 */
async function runTests() {
    try {
        // TEST 1: Ping básico - Obtener info del contribuyente
        console.log('\n\n🧪 TEST 1: Obtener información del contribuyente');
        await makeRequest('GET', `/api/dte/contribuyentes/info/${RUT}`);

        // Esperar un poco entre requests
        await new Promise(resolve => setTimeout(resolve, 1000));

        // TEST 2: Listar documentos temporales (endpoint simple)
        console.log('\n\n🧪 TEST 2: Listar documentos temporales');
        await makeRequest('POST', `/api/dte/dte_tmps/buscar/${RUT}`, {
            limit: 5
        });

        // Esperar un poco entre requests
        await new Promise(resolve => setTimeout(resolve, 1000));

        // TEST 3: Buscar DTEs recibidos
        console.log('\n\n🧪 TEST 3: Buscar DTEs recibidos');
        await makeRequest('POST', `/api/dte/dte_recibidos/buscar/${RUT}`, {
            fecha_desde: '2026-01-01',
            fecha_hasta: '2026-02-11',
            limit: 5
        });

        console.log('\n\n' + '='.repeat(60));
        console.log('✅ PRUEBAS COMPLETADAS');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n\n❌ ERROR GENERAL:', error);
    }
}

// Ejecutar las pruebas
runTests();
