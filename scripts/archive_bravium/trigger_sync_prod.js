const https = require('https');
const http = require('http');

const BACKEND_URL = process.env.BACKEND_URL || 'https://bravium-backend.onrender.com';

console.log('📤 DISPARADOR DE SINCRONIZACIÓN LIBREDTE -> BASE DE DATOS');
console.log('='.repeat(70));
console.log(`📡 Backend Objetivo: ${BACKEND_URL}`);
console.log(`📅 Período: 2026-01-01 a 2026-01-31`);
console.log('='.repeat(70));

async function triggerSync() {
    try {
        console.log('\n🔄 Iniciando solicitud de sincronización...\n');

        const isHttps = BACKEND_URL.startsWith('https');
        const client = isHttps ? https : http;

        let host = BACKEND_URL.replace('https://', '').replace('http://', '');
        let port = isHttps ? 443 : 80;

        if (host.includes(':')) {
            const parts = host.split(':');
            host = parts[0];
            port = parseInt(parts[1]);
        }

        const payload = JSON.stringify({
            fromDate: '2026-01-01',
            toDate: '2026-01-31'
        });

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
                console.log(`📊 Status Code: ${res.statusCode}\n`);

                try {
                    // Intentar parsear JSON, si falla mostrar texto raw
                    const result = JSON.parse(responseBody);

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log('✅ SINCRONIZACIÓN EXITOSA');
                        console.log('─'.repeat(30));

                        // Adaptar a la respuesta real
                        if (result.data) {
                            console.log(`📥 Total Procesados: ${result.data.total ?? '?'}`);
                            console.log(`🆕 Creados (Nuevos): ${result.data.created ?? 0}`);
                            console.log(`⏭️  Omitidos (Existentes): ${result.data.skipped ?? 0}`);
                            console.log(`❌ Errores: ${result.data.errors ?? 0}`);
                        } else {
                            console.log('Respuesta:', JSON.stringify(result, null, 2));
                        }
                    } else {
                        console.log('❌ ERROR EN SINCRONIZACIÓN');
                        console.log(`Mensaje: ${result.message || 'Error desconocido'}`);
                        if (result.error) console.log('Detalle:', result.error);
                    }
                } catch (e) {
                    console.log('📄 Respuesta Raw (No JSON):');
                    console.log(responseBody.substring(0, 1000));
                }
                console.log('\n' + '='.repeat(70));
            });
        });

        req.on('error', (error) => {
            console.error('❌ Error de red:', error.message);
        });

        req.write(payload);
        req.end();

    } catch (error) {
        console.error('❌ Excepción:', error.message);
    }
}

triggerSync();
