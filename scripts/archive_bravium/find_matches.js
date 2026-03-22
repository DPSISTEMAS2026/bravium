const https = require('https');

const API_URL = 'https://bravium-backend.onrender.com';

async function findPotentialMatches() {
    console.log('🔍 Searching for Potential Matches...\n');

    const response = await fetch(`${API_URL}/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31`);
    const data = await response.json();

    const transactions = data.pending?.transactions || [];
    const dtes = data.pending?.dtes || [];

    console.log(`📊 Data Available:`);
    console.log(`  Transactions: ${transactions.length}`);
    console.log(`  DTEs: ${dtes.length}\n`);

    console.log('💰 Transaction Amounts (Top 10):');
    transactions.slice(0, 10).forEach(tx => {
        console.log(`  $${Math.abs(tx.amount).toLocaleString().padStart(12)} - ${tx.description}`);
    });

    console.log('\n📄 DTE Amounts (Top 10):');
    dtes.slice(0, 10).forEach(dte => {
        console.log(`  $${dte.totalAmount.toLocaleString().padStart(12)} - Folio ${dte.folio}`);
    });

    console.log('\n🔍 Looking for matches within $1,000 tolerance...');
    let matchCount = 0;

    for (const tx of transactions) {
        const txAmount = Math.abs(tx.amount);
        for (const dte of dtes) {
            const diff = Math.abs(txAmount - dte.totalAmount);
            if (diff <= 1000) {
                matchCount++;
                console.log(`  ✅ MATCH FOUND!`);
                console.log(`     TX: $${txAmount.toLocaleString()} (${tx.date.split('T')[0]}) - ${tx.description}`);
                console.log(`     DTE: $${dte.totalAmount.toLocaleString()} (${dte.issuedDate.split('T')[0]}) - Folio ${dte.folio}`);
                console.log(`     Difference: $${diff}\n`);
            }
        }
    }

    if (matchCount === 0) {
        console.log('  ❌ No matches found within $1,000 tolerance');
        console.log('\n💡 DIAGNOSIS:');
        console.log('  The DTEs loaded have VERY LARGE amounts (millions)');
        console.log('  while bank transactions are SMALL amounts (thousands).');
        console.log('  This suggests the DTEs are from a different period or');
        console.log('  there\'s a data mismatch between what was loaded and');
        console.log('  what should be reconciled.');
    } else {
        console.log(`\n✅ Found ${matchCount} potential matches!`);
    }
}

findPotentialMatches().catch(console.error);
