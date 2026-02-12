// Re-sync all DTEs from LibreDTE (fresh sync)
const API_URL = 'https://bravium-backend.onrender.com';

async function resyncDtes() {
    console.log('🔄 Re-syncing DTEs from LibreDTE...\n');
    console.log('This will fetch ALL DTEs from January 2026 and save them to the database.\n');

    const response = await fetch(`${API_URL}/ingestion/libredte/sync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fromDate: '2026-01-01',
            toDate: '2026-01-31'
        })
    });

    console.log(`Status: ${response.status}`);

    const result = await response.json();

    if (response.ok) {
        console.log('\n✅ Sync completed:');
        console.log(`  Total fetched: ${result.data?.total || 0}`);
        console.log(`  Created: ${result.data?.created || 0}`);
        console.log(`  Skipped (already existed): ${result.data?.skipped || 0}`);
        console.log(`  Errors: ${result.data?.errors || 0}`);

        if (result.data?.created === 0 && result.data?.skipped > 0) {
            console.log('\n⚠️  All DTEs were skipped because they already exist in the database.');
            console.log('   This is normal if you\'ve already synced before.');
            console.log('   The DTEs are there, but they might not be showing up due to a different issue.');
        }
    } else {
        console.log('\n❌ Sync failed:');
        console.log(result);
    }
}

resyncDtes().catch(console.error);
