/**
 * run_auto_match_standalone.ts
 * 
 * Dispara el auto-match contra el servidor de producción en Render.
 * Obtiene un JWT y llama al endpoint POST /conciliacion/run-auto-match.
 */

const BASE_URL = process.env.API_URL || 'https://bravium-api.onrender.com';

async function main() {
  console.log(`\n🎯 AUTO-MATCH via API: ${BASE_URL}\n`);

  // 1. Login
  console.log('🔐 Autenticando...');
  
  // Intentar varias rutas comunes
  const loginPaths = ['/auth/login', '/api/auth/login'];
  let access_token: string | null = null;

  for (const path of loginPaths) {
    try {
      const loginRes = await fetch(BASE_URL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@dpsistemas.cl', password: 'admin123' })
      });

      if (loginRes.ok) {
        const data = await loginRes.json() as any;
        access_token = data.access_token;
        console.log(`✅ Login exitoso via ${path}`);
        break;
      } else {
        console.log(`  ❌ ${path}: ${loginRes.status} ${loginRes.statusText}`);
      }
    } catch (e: any) {
      console.log(`  ❌ ${path}: ${e.message}`);
    }
  }

  if (!access_token) {
    console.error('❌ No se pudo autenticar. Verificar URL y credenciales.');
    console.log('\n💡 Alternativa: ejecutar el auto-match localmente con:');
    console.log('   npx ts-node scripts/run_auto_match_local.ts\n');
    return;
  }

  // 2. Ejecutar auto-match
  const today = new Date().toISOString().split('T')[0];
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const fromDate = sixtyDaysAgo.toISOString().split('T')[0];

  console.log(`\n🤖 Ejecutando auto-match: ${fromDate} → ${today}`);

  const matchPaths = ['/conciliacion/run-auto-match', '/api/conciliacion/run-auto-match'];
  
  for (const path of matchPaths) {
    try {
      const matchRes = await fetch(BASE_URL + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + access_token
        },
        body: JSON.stringify({ fromDate, toDate: today })
      });

      if (matchRes.ok) {
        const result = await matchRes.json();
        console.log(`✅ Auto-match disparado via ${path}:`);
        console.log(JSON.stringify(result, null, 2));
        return;
      } else {
        console.log(`  ❌ ${path}: ${matchRes.status} ${matchRes.statusText}`);
      }
    } catch (e: any) {
      console.log(`  ❌ ${path}: ${e.message}`);
    }
  }

  console.error('❌ No se encontró el endpoint de auto-match.');
}

main().catch(console.error);
