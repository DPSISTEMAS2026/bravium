const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_URL = process.env.BACKEND_URL || 'https://bravium-backend.onrender.com';
const DATA_FILE = path.join(__dirname, '..', 'data', 'dtes_enero_2026.json');

console.log('📤 SCRIPT DE CARGA MANUAL DE DTEs');
console.log('='.repeat(70));

if (!fs.existsSync(DATA_FILE)) {
    console.error(`❌ Archivo no encontrado: ${DATA_FILE}`);
    process.exit(1);
}

try {
    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(rawData);

    // Detectar estructura
    let dtesArray = [];
    if (Array.isArray(data)) {
        dtesArray = data;
    } else if (Array.isArray(data.dtes_recibidos)) {
        dtesArray = data.dtes_recibidos;
    } else if (Array.isArray(data.data)) {
        dtesArray = data.data;
    }

    if (dtesArray.length === 0) {
        console.error('❌ No se encontraron DTEs válidos en el archivo JSON.');
        process.exit(1);
    }

    console.log(`📦 Archivo leído: ${path.basename(DATA_FILE)}`);
    console.log(`📊 Cantidad de DTEs a cargar: ${dtesArray.length}`);
    console.log(`📡 Enviando a: ${BACKEND_URL}/ingestion/libredte/sync`);

    uploadData(dtesArray);

} catch (error) {
    console.error('❌ Error leyendo archivo:', error.message);
}

function uploadData(dtes) {
    const isHttps = BACKEND_URL.startsWith('https');
    const client = isHttps ? https : http;

    let host = BACKEND_URL.replace('https://', '').replace('http://', '');
    let port = isHttps ? 443 : 80;

    if (host.includes(':')) {
        const parts = host.split(':');
        host = parts[0];
        port = parseInt(parts[1]);
    }

    // Payload con inyección manual
    const payload = JSON.stringify({
        fromDate: '2026-01-01', // Requerido por validación del DTO
        toDate: '2026-01-31',   // Requerido por validación del DTO
        dtes: dtes              // <--- Aquí van los datos reales
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

    console.log('\n🚀 Iniciando subida (puede tardar unos segundos)...');

    const req = client.request(options, (res) => {
        let responseBody = '';

        res.on('data', (chunk) => responseBody += chunk);

        res.on('end', () => {
            console.log(`\n📊 Status Code: ${res.statusCode}`);

            try {
                const result = JSON.parse(responseBody);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('✅ CARGA COMPLETADA');
                    console.log('─'.repeat(30));
                    console.log(`📥 Recibidos: ${result.data.total}`);
                    console.log(`🆕 Creados en DB: ${result.data.created}`);
                    console.log(`⏭️  Omitidos (Ya existían): ${result.data.skipped}`);
                    console.log(`❌ Errores: ${result.data.errors}`);
                } else {
                    console.log('❌ Error en el servidor:', result);
                }
            } catch (e) {
                console.log('📄 Respuesta Raw:', responseBody.substring(0, 500));
            }
            console.log('='.repeat(70));
        });
    });

    req.on('error', (e) => {
        console.error('❌ Error de conexión:', e.message);
    });

    req.write(payload);
    req.end();
}
