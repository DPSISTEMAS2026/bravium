/**
 * Script para cargar TODOS los DTEs de Enero 2026 desde LibreDTE
 * 
 * Este script obtiene todos los DTEs recibidos de enero y los guarda
 * en un archivo JSON para análisis y carga posterior a la BD
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==';
const RUT = '77154188';

console.log('📥 EXTRACCIÓN DE DTEs DE ENERO 2026');
console.log('='.repeat(70));
console.log('📅 Período: 2026-01-01 → 2026-01-31');
console.log('🏢 RUT: ' + RUT);
console.log('='.repeat(70));

function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;

        const options = {
            hostname: 'libredte.cl',
            port: 443,
            path: path,
            method: method,
            headers: {
                'Authorization': `Basic ${API_KEY}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'BRAVIUM/1.0'
            },
            timeout: 30000
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
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
                    return;
                }

                // Limpiar PHP notices si existen
                let cleanedText = responseBody;
                if (responseBody.includes('<br />')) {
                    const jsonStart = responseBody.indexOf('[');
                    if (jsonStart !== -1) {
                        cleanedText = responseBody.substring(jsonStart);
                    }
                }

                try {
                    const parsed = JSON.parse(cleanedText);
                    resolve(parsed);
                } catch (e) {
                    reject(new Error('Invalid JSON: ' + e.message));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (data) req.write(data);
        req.end();
    });
}

async function fetchEneroData() {
    try {
        console.log('\n📡 Obteniendo DTEs Recibidos de Enero...\n');

        const dtesRecibidos = await makeRequest(
            'POST',
            `/api/dte/dte_recibidos/buscar/${RUT}?_contribuyente_rut=${RUT}`,
            {
                fecha_desde: '2026-01-01',
                fecha_hasta: '2026-01-31',
                limit: 10000 // Obtener todos
            }
        );

        console.log(`✅ DTEs Recibidos: ${dtesRecibidos.length} documentos\n`);

        // Esperar un poco antes del siguiente request
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('📡 Obteniendo Registro de Compras de Enero...\n');

        const registroCompras = await makeRequest(
            'POST',
            `/api/dte/registro_compras/buscar/${RUT}?_contribuyente_rut=${RUT}`,
            {
                periodo: '2026-01'
            }
        );

        console.log(`✅ Registro de Compras: ${registroCompras.length} registros\n`);

        // Consolidar datos
        const consolidado = {
            periodo: 'Enero 2026',
            fecha_extraccion: new Date().toISOString(),
            rut_empresa: RUT,
            estadisticas: {
                total_dtes_recibidos: dtesRecibidos.length,
                total_registro_compras: registroCompras.length
            },
            dtes_recibidos: dtesRecibidos,
            registro_compras: registroCompras
        };

        // Guardar en archivo
        const outputDir = path.join(__dirname, '..', 'data');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const outputFile = path.join(outputDir, 'dtes_enero_2026.json');
        fs.writeFileSync(outputFile, JSON.stringify(consolidado, null, 2));

        console.log('='.repeat(70));
        console.log('✅ EXTRACCIÓN COMPLETADA');
        console.log('='.repeat(70));
        console.log(`\n📄 Archivo guardado: ${outputFile}`);
        console.log(`\n📊 RESUMEN:`);
        console.log(`   DTEs Recibidos: ${dtesRecibidos.length}`);
        console.log(`   Registro Compras: ${registroCompras.length}`);

        // Análisis rápido
        console.log(`\n💰 ANÁLISIS DE MONTOS:`);

        const totalDtes = dtesRecibidos.reduce((sum, dte) => sum + (dte.total || 0), 0);
        const totalCompras = registroCompras.reduce((sum, reg) => sum + (reg.total || 0), 0);

        console.log(`   Total DTEs Recibidos: $${totalDtes.toLocaleString('es-CL')}`);
        console.log(`   Total Registro Compras: $${totalCompras.toLocaleString('es-CL')}`);

        // Proveedores únicos
        const proveedoresUnicos = new Set(dtesRecibidos.map(d => d.emisor));
        console.log(`\n👥 PROVEEDORES:`);
        console.log(`   Proveedores únicos: ${proveedoresUnicos.size}`);

        // Tipos de documentos
        const tiposDte = {};
        dtesRecibidos.forEach(d => {
            tiposDte[d.dte] = (tiposDte[d.dte] || 0) + 1;
        });

        console.log(`\n📋 TIPOS DE DOCUMENTOS:`);
        Object.entries(tiposDte).sort((a, b) => b[1] - a[1]).forEach(([tipo, count]) => {
            const nombreTipo = {
                '33': 'Factura Electrónica',
                '34': 'Factura Exenta',
                '46': 'Factura de Compra',
                '52': 'Guía de Despacho',
                '56': 'Nota de Débito',
                '61': 'Nota de Crédito'
            }[tipo] || `Tipo ${tipo}`;
            console.log(`   ${nombreTipo}: ${count}`);
        });

        console.log('\n' + '='.repeat(70));
        console.log('💡 PRÓXIMO PASO:');
        console.log('   Ejecuta el backend y carga estos datos:');
        console.log('   npm run start:dev');
        console.log('   node scripts/load_enero_to_db.js');
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        process.exit(1);
    }
}

fetchEneroData();
