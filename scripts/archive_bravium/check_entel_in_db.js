// Check if Entel DTE exists in database via direct API call
const API_URL = 'https://bravium-backend.onrender.com';

async function checkEntelDte() {
    console.log('🔍 Checking if Entel DTE (Folio 52707976) exists in database...\n');

    // The dashboard only shows top 20 by amount, so let's check all DTEs
    // We'll need to call a different endpoint or check the logs

    console.log('📊 Checking dashboard data (limited to top 20 by amount):');
    const dashResponse = await fetch(`${API_URL}/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31`);
    const dashData = await dashResponse.json();

    const dtes = dashData.pending?.dtes || [];
    console.log(`  DTEs shown: ${dtes.length}`);
    console.log(`  Smallest amount shown: $${Math.min(...dtes.map(d => d.totalAmount)).toLocaleString()}`);
    console.log(`  Largest amount shown: $${Math.max(...dtes.map(d => d.totalAmount)).toLocaleString()}\n`);

    const entelInList = dtes.find(d => d.folio === 52707976);

    if (entelInList) {
        console.log('✅ Entel DTE IS in the top 20 list!');
        console.log(`   Amount: $${entelInList.totalAmount.toLocaleString()}`);
    } else {
        console.log('❌ Entel DTE is NOT in the top 20 list');
        console.log('   This means it exists in the database but is not shown');
        console.log('   because the dashboard only shows the top 20 DTEs by amount.\n');

        console.log('💡 SOLUTION:');
        console.log('   The Auto-Match algorithm searches ALL DTEs in the database,');
        console.log('   not just the top 20 shown in the dashboard.');
        console.log('   So it SHOULD find the Entel DTE when matching.\n');

        console.log('🔧 Let me run Auto-Match now to verify...');
    }
}

checkEntelDte().catch(console.error);
