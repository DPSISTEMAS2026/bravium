// Quick check of production database
const https = require('https');

const API_URL = 'https://bravium-backend.onrender.com';

async function checkData() {
    console.log('🔍 Checking Production Data...\n');

    // Check DTEs
    const dtesResponse = await fetch(`${API_URL}/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31`);
    const data = await dtesResponse.json();

    console.log('📊 Dashboard Summary:');
    console.log(`  Total DTEs: ${data.summary?.dtes?.total || 0}`);
    console.log(`  Unpaid DTEs: ${data.summary?.dtes?.unpaid || 0}`);
    console.log(`  Pending DTEs shown: ${data.pending?.dtes?.length || 0}`);
    console.log(`  Total Transactions: ${data.summary?.transactions?.total || 0}`);
    console.log(`  Pending Transactions: ${data.summary?.transactions?.pending || 0}`);

    if (data.pending?.dtes?.length > 0) {
        console.log('\n📄 Sample DTEs:');
        data.pending.dtes.slice(0, 3).forEach(dte => {
            console.log(`  Folio ${dte.folio}: $${dte.totalAmount?.toLocaleString()} - ${dte.issuedDate}`);
        });
    }

    if (data.pending?.transactions?.length > 0) {
        console.log('\n💳 Sample Transactions:');
        data.pending.transactions.slice(0, 3).forEach(tx => {
            console.log(`  ${tx.date}: $${Math.abs(tx.amount)?.toLocaleString()} - ${tx.description}`);
        });
    }
}

checkData().catch(console.error);
