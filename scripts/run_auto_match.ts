/**
 * run_auto_match.ts
 * Ejecuta el auto-match contra el servidor en producción vía API.
 */

async function main() {
  const baseUrl = 'https://bravium-api.onrender.com';

  // 1. Login
  console.log('🔐 Autenticando...');
  const loginRes = await fetch(baseUrl + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@dpsistemas.cl', password: 'admin123' })
  });

  if (!loginRes.ok) {
    console.error('❌ Login failed:', await loginRes.text());
    return;
  }

  const { access_token } = await loginRes.json() as any;
  console.log('✅ Token obtenido');

  // 2. Ejecutar auto-match (últimos 60 días)
  const today = new Date().toISOString().split('T')[0];
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const fromDate = sixtyDaysAgo.toISOString().split('T')[0];

  console.log(`🤖 Ejecutando auto-match: ${fromDate} → ${today}`);

  const matchRes = await fetch(baseUrl + '/conciliacion/run-auto-match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + access_token
    },
    body: JSON.stringify({ fromDate, toDate: today })
  });

  const result = await matchRes.json();
  console.log('📋 Resultado:', JSON.stringify(result, null, 2));

  // 3. Esperar unos segundos y revisar el briefing para ver el estado
  console.log('\n⏳ Esperando 15s para que el motor procese...');
  await new Promise(r => setTimeout(r, 15000));

  console.log('📊 Consultando briefing...');
  const briefRes = await fetch(baseUrl + '/conciliacion/briefing', {
    headers: { 'Authorization': 'Bearer ' + access_token }
  });

  if (briefRes.ok) {
    const briefing = await briefRes.json() as any;
    console.log('\n📊 BRIEFING POST-MATCH:');
    console.log(JSON.stringify(briefing, null, 2));
  }
}

main().catch(console.error);
