// Run Auto-Match to find matches
const API_URL = 'https://bravium-backend.onrender.com';

async function runAutoMatch() {
    console.log('🤖 Running Auto-Match...\n');

    const response = await fetch(`${API_URL}/conciliacion/run-auto-match`, {
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
        console.log('\n✅ Auto-Match completed:');
        console.log(`  Transactions processed: ${result.data?.processed || 0}`);
        console.log(`  Matches found: ${result.data?.matches || 0}\n`);

        if (result.data?.matches > 0) {
            console.log('🎉 SUCCESS! Matches were found!');
            console.log('   The Entel invoice and other small DTEs should now be matched.');
        } else {
            console.log('❌ No matches found.');
            console.log('   This could mean:');
            console.log('   1. The amounts don\'t match within $1,000 tolerance');
            console.log('   2. The dates are more than 120 days apart');
            console.log('   3. All transactions are already matched');
        }
    } else {
        console.log('\n❌ Auto-Match failed:');
        console.log(result);
    }
}

runAutoMatch().catch(console.error);
