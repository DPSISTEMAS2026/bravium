/**
 * Script de análisis de DTEs de Enero 2026
 * 
 * Analiza el archivo JSON para identificar:
 * - Campos disponibles para matching
 * - Distribución de montos
 * - Fechas de emisión
 * - Proveedores principales
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'dtes_enero_2026.json');

console.log('🔍 ANÁLISIS DETALLADO DE DTEs DE ENERO 2026');
console.log('='.repeat(70));

if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ Error: Archivo no encontrado');
    console.log('   Ejecuta primero: node scripts/extract_enero_dtes.js');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
const dtes = data.dtes_recibidos;

console.log(`\n📊 ESTADÍSTICAS GENERALES:`);
console.log(`   Total DTEs: ${dtes.length}`);
console.log(`   Período: Enero 2026`);
console.log('');

// 1. CAMPOS DISPONIBLES PARA MATCHING
console.log('='.repeat(70));
console.log('🔑 CAMPOS DISPONIBLES PARA MATCHING:');
console.log('='.repeat(70));

if (dtes.length > 0) {
    const sample = dtes[0];
    console.log('\n📋 Campos en cada DTE:');
    Object.keys(sample).forEach(key => {
        const value = sample[key];
        const type = typeof value;
        console.log(`   - ${key}: ${type} (ej: ${JSON.stringify(value).substring(0, 50)})`);
    });
}

// 2. DISTRIBUCIÓN DE MONTOS
console.log('\n' + '='.repeat(70));
console.log('💰 DISTRIBUCIÓN DE MONTOS:');
console.log('='.repeat(70));

const montos = dtes.map(d => d.total || 0).sort((a, b) => a - b);
const total = montos.reduce((sum, m) => sum + m, 0);
const promedio = total / montos.length;
const mediana = montos[Math.floor(montos.length / 2)];

console.log(`\n   Total: $${total.toLocaleString('es-CL')}`);
console.log(`   Promedio: $${Math.round(promedio).toLocaleString('es-CL')}`);
console.log(`   Mediana: $${Math.round(mediana).toLocaleString('es-CL')}`);
console.log(`   Mínimo: $${montos[0].toLocaleString('es-CL')}`);
console.log(`   Máximo: $${montos[montos.length - 1].toLocaleString('es-CL')}`);

// Rangos de montos
const rangos = {
    'Menos de $100k': montos.filter(m => m < 100000).length,
    '$100k - $500k': montos.filter(m => m >= 100000 && m < 500000).length,
    '$500k - $1M': montos.filter(m => m >= 500000 && m < 1000000).length,
    '$1M - $5M': montos.filter(m => m >= 1000000 && m < 5000000).length,
    'Más de $5M': montos.filter(m => m >= 5000000).length,
};

console.log('\n   Distribución por rangos:');
Object.entries(rangos).forEach(([rango, count]) => {
    const pct = ((count / dtes.length) * 100).toFixed(1);
    console.log(`   ${rango}: ${count} (${pct}%)`);
});

// 3. DISTRIBUCIÓN POR FECHAS
console.log('\n' + '='.repeat(70));
console.log('📅 DISTRIBUCIÓN POR FECHAS:');
console.log('='.repeat(70));

const porFecha = {};
dtes.forEach(d => {
    const fecha = d.fecha;
    porFecha[fecha] = (porFecha[fecha] || 0) + 1;
});

const fechasOrdenadas = Object.entries(porFecha).sort((a, b) => a[0].localeCompare(b[0]));
console.log('\n   DTEs por día (top 10):');
fechasOrdenadas.slice(0, 10).forEach(([fecha, count]) => {
    console.log(`   ${fecha}: ${count} DTEs`);
});

// 4. PROVEEDORES PRINCIPALES
console.log('\n' + '='.repeat(70));
console.log('👥 PROVEEDORES PRINCIPALES:');
console.log('='.repeat(70));

const proveedores = new Map();
dtes.forEach(dte => {
    const rut = String(dte.emisor);
    if (!proveedores.has(rut)) {
        proveedores.set(rut, {
            rut,
            nombre: dte.razon_social,
            dtes: [],
            total: 0
        });
    }
    const prov = proveedores.get(rut);
    prov.dtes.push(dte);
    prov.total += (dte.total || 0);
});

const topProveedores = Array.from(proveedores.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

console.log('\n   Top 15 por monto total:');
topProveedores.forEach((prov, idx) => {
    console.log(`   ${idx + 1}. ${prov.nombre || 'Sin nombre'}`);
    console.log(`      RUT: ${prov.rut}`);
    console.log(`      DTEs: ${prov.dtes.length}`);
    console.log(`      Total: $${prov.total.toLocaleString('es-CL')}`);
    console.log('');
});

// 5. TIPOS DE DOCUMENTOS
console.log('='.repeat(70));
console.log('📋 TIPOS DE DOCUMENTOS:');
console.log('='.repeat(70));

const tiposDte = {};
const nombresTipo = {
    '33': 'Factura Electrónica',
    '34': 'Factura Exenta',
    '46': 'Factura de Compra',
    '52': 'Guía de Despacho',
    '56': 'Nota de Débito',
    '61': 'Nota de Crédito'
};

dtes.forEach(d => {
    const tipo = String(d.dte);
    if (!tiposDte[tipo]) {
        tiposDte[tipo] = {
            count: 0,
            total: 0,
            nombre: nombresTipo[tipo] || `Tipo ${tipo}`
        };
    }
    tiposDte[tipo].count++;
    tiposDte[tipo].total += (d.total || 0);
});

console.log('');
Object.entries(tiposDte).sort((a, b) => b[1].count - a[1].count).forEach(([tipo, info]) => {
    console.log(`   ${info.nombre}:`);
    console.log(`      Cantidad: ${info.count}`);
    console.log(`      Total: $${info.total.toLocaleString('es-CL')}`);
    console.log('');
});

// 6. DATOS PARA MATCHING
console.log('='.repeat(70));
console.log('🎯 ANÁLISIS PARA MATCHING CON TRANSACCIONES BANCARIAS:');
console.log('='.repeat(70));

console.log('\n   ✅ Campos útiles para matching:');
console.log('      - total: Monto exacto del DTE');
console.log('      - fecha: Fecha de emisión (puede diferir de fecha de pago)');
console.log('      - emisor: RUT del proveedor');
console.log('      - razon_social: Nombre del proveedor');
console.log('      - folio: Número único del documento');
console.log('      - dte: Tipo de documento');

console.log('\n   💡 Estrategias de matching sugeridas:');
console.log('      1. Match exacto por monto + fecha (±3 días)');
console.log('      2. Match por monto + RUT proveedor');
console.log('      3. Match por monto similar (±2%) + fecha cercana');
console.log('      4. Match manual para casos complejos');

console.log('\n   ⚠️  Consideraciones:');
console.log('      - Las Notas de Crédito (tipo 61) restan del total');
console.log('      - La fecha del DTE puede no coincidir con la fecha de pago');
console.log('      - Algunos pagos pueden ser parciales');
console.log('      - Algunos DTEs pueden tener múltiples pagos');

// 7. EXPORTAR RESUMEN
const resumen = {
    total_dtes: dtes.length,
    total_monto: total,
    promedio_monto: promedio,
    proveedores_unicos: proveedores.size,
    tipos_documento: tiposDte,
    top_proveedores: topProveedores.slice(0, 10).map(p => ({
        rut: p.rut,
        nombre: p.nombre,
        cantidad_dtes: p.dtes.length,
        monto_total: p.total
    })),
    rango_fechas: {
        desde: fechasOrdenadas[0][0],
        hasta: fechasOrdenadas[fechasOrdenadas.length - 1][0]
    }
};

const resumenFile = path.join(__dirname, '..', 'data', 'analisis_enero_2026.json');
fs.writeFileSync(resumenFile, JSON.stringify(resumen, null, 2));

console.log('\n' + '='.repeat(70));
console.log(`📄 Resumen guardado en: ${resumenFile}`);
console.log('='.repeat(70));
