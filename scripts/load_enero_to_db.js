/**
 * Script para cargar los DTEs de Enero 2026 a la base de datos
 * 
 * Lee el archivo JSON generado por extract_enero_dtes.js y
 * carga los datos a través del endpoint del backend
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const BACKEND_URL = process.env.BACKEND_URL || 'localhost:3000';
const DATA_FILE = path.join(__dirname, '..', 'data', 'dtes_enero_2026.json');

console.log('📤 CARGA DE DTEs DE ENERO 2026 A LA BASE DE DATOS');
console.log('='.repeat(70));

// Verificar que existe el archivo
if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ Error: Archivo de datos no encontrado');
    console.log('   Ejecuta primero: node scripts/extract_enero_dtes.js');
    process.exit(1);
}

// Leer datos
console.log('📖 Leyendo archivo de datos...\n');
const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
const data = JSON.parse(rawData);

console.log(`📊 Datos cargados:`);
console.log(`   DTEs Recibidos: ${data.dtes_recibidos.length}`);
console.log(`   Registro Compras: ${data.registro_compras.length}`);
console.log(`   Proveedores únicos: ${data.estadisticas ? new Set(data.dtes_recibidos.map(d => d.emisor)).size : 'N/A'}`);
console.log('');

async function loadToBackend() {
    try {
        console.log('📡 Conectando al backend...\n');

        const [host, port] = BACKEND_URL.split(':');

        // Preparar payload para el backend
        // El backend espera fromDate y toDate, pero nosotros ya tenemos los datos
        // Vamos a usar el endpoint de sincronización

        const payload = JSON.stringify({
            fromDate: '2026-01-01',
            toDate: '2026-01-31'
        });

        const options = {
            hostname: host,
            port: port || 3000,
            path: '/ingestion/libredte/sync',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = http.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                console.log(`📊 Status: ${res.statusCode}\n`);

                try {
                    const result = JSON.parse(responseBody);

                    if (result.status === 'success') {
                        console.log('✅ CARGA EXITOSA\n');
                        console.log('='.repeat(70));
                        console.log(`📊 RESULTADOS:`);
                        console.log(`   Total procesados: ${result.data.total}`);
                        console.log(`   ✅ Creados: ${result.data.created}`);
                        console.log(`   ⏭️  Omitidos (duplicados): ${result.data.skipped}`);
                        console.log(`   ❌ Errores: ${result.data.errors}`);
                        console.log('='.repeat(70));

                        if (result.data.created > 0) {
                            console.log('\n💡 PRÓXIMO PASO:');
                            console.log('   Los DTEs están en la base de datos.');
                            console.log('   El sistema de conciliación buscará matches automáticamente.');
                            console.log('   Puedes ejecutar manualmente:');
                            console.log('   POST /conciliacion/run-auto-match');
                        }
                    } else {
                        console.log('❌ ERROR EN LA CARGA\n');
                        console.log(`   Mensaje: ${result.message}`);
                        if (result.stack) {
                            console.log(`\n   Stack:\n${result.stack.substring(0, 500)}`);
                        }
                    }
                } catch (e) {
                    console.log('📄 Respuesta (raw):', responseBody.substring(0, 500));
                }

                console.log('\n' + '='.repeat(70));
            });
        });

        req.on('error', (error) => {
            console.error('❌ Error de conexión:', error.message);
            console.log('\n💡 Asegúrate de que el backend esté corriendo:');
            console.log('   npm run start:dev');
            console.log('\n   O verifica la URL del backend:');
            console.log(`   BACKEND_URL=${BACKEND_URL}`);
        });

        req.write(payload);
        req.end();

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Mostrar resumen antes de cargar
console.log('='.repeat(70));
console.log('📋 RESUMEN DE DATOS A CARGAR:');
console.log('='.repeat(70));

// Análisis de proveedores
const proveedoresMap = new Map();
data.dtes_recibidos.forEach(dte => {
    const rut = String(dte.emisor);
    if (!proveedoresMap.has(rut)) {
        proveedoresMap.set(rut, {
            rut,
            nombre: dte.razon_social,
            count: 0,
            total: 0
        });
    }
    const prov = proveedoresMap.get(rut);
    prov.count++;
    prov.total += (dte.total || 0);
});

console.log(`\n👥 Top 10 Proveedores por cantidad de DTEs:`);
const topProveedores = Array.from(proveedoresMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

topProveedores.forEach((prov, idx) => {
    console.log(`   ${idx + 1}. ${prov.nombre || prov.rut} - ${prov.count} DTEs ($${prov.total.toLocaleString('es-CL')})`);
});

console.log('\n' + '='.repeat(70));
console.log('🚀 Iniciando carga al backend...\n');

loadToBackend();
