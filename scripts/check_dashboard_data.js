// Script para verificar datos del dashboard desde el API
const API_URL = 'https://bravium-backend.onrender.com';

async function checkDashboardData() {
    console.log('🔍 Verificando datos del dashboard desde el API...\n');

    try {
        // Obtener datos de Enero 2026
        const response = await fetch(`${API_URL}/conciliacion/dashboard?year=2026&months=1`);

        if (!response.ok) {
            console.error(`❌ Error: ${response.status} ${response.statusText}`);
            return;
        }

        const data = await response.json();

        console.log('📊 RESUMEN DEL DASHBOARD (Enero 2026):\n');

        console.log('💰 Transacciones Bancarias:');
        console.log(`   Total: ${data.summary.transactions.total}`);
        console.log(`   Conciliadas: ${data.summary.transactions.matched}`);
        console.log(`   Pendientes: ${data.summary.transactions.pending}`);
        console.log(`   Tasa: ${data.summary.transactions.match_rate}\n`);

        console.log('📄 DTEs (Facturas):');
        console.log(`   Total: ${data.summary.dtes.total}`);
        console.log(`   Pagadas: ${data.summary.dtes.paid}`);
        console.log(`   Por pagar: ${data.summary.dtes.unpaid}`);
        console.log(`   Monto pendiente: $${data.summary.dtes.outstanding_amount.toLocaleString()}\n`);

        console.log('🔗 Matches (Conciliaciones):');
        console.log(`   Total: ${data.summary.matches.total}`);
        console.log(`   Automáticas: ${data.summary.matches.automatic}`);
        console.log(`   Manuales: ${data.summary.matches.manual}\n`);

        // Análisis de posibles duplicados
        console.log('🔍 ANÁLISIS:');

        if (data.summary.matches.total > data.summary.transactions.total) {
            console.log(`   ⚠️  ALERTA: Hay más matches (${data.summary.matches.total}) que transacciones (${data.summary.transactions.total})`);
            console.log(`   Esto podría indicar duplicados en los matches.`);
        }

        if (data.summary.matches.total > data.summary.dtes.total) {
            console.log(`   ⚠️  ALERTA: Hay más matches (${data.summary.matches.total}) que DTEs (${data.summary.dtes.total})`);
            console.log(`   Esto podría indicar duplicados en los matches.`);
        }

        const expectedMaxMatches = Math.min(data.summary.transactions.total, data.summary.dtes.total);
        if (data.summary.matches.total > expectedMaxMatches) {
            console.log(`   ⚠️  PROBLEMA: ${data.summary.matches.total} matches excede el máximo posible de ${expectedMaxMatches}`);
            console.log(`   Definitivamente hay duplicados en la tabla de matches.`);
        } else {
            console.log(`   ✅ El número de matches (${data.summary.matches.total}) es razonable.`);
        }

        console.log('\n📋 Detalles de matches:');
        if (data.matches && data.matches.length > 0) {
            console.log(`   Mostrando primeros ${Math.min(5, data.matches.length)} matches:`);
            data.matches.slice(0, 5).forEach((match, i) => {
                console.log(`   ${i + 1}. TX: ${match.transaction?.description || 'N/A'} | DTE: ${match.dte?.folio || 'N/A'} | $${match.transaction?.amount || 0}`);
            });
        }

    } catch (error) {
        console.error('❌ Error al consultar el API:', error.message);
    }
}

checkDashboardData();
