// Check what DTEs are actually in production database
const API_URL = 'https://bravium-backend.onrender.com';

async function checkProductionDtes() {
    console.log('🔍 Checking DTEs in Production Database...\n');

    // Get all DTEs for January 2026
    const response = await fetch(`${API_URL}/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31`);
    const data = await response.json();

    console.log(`📊 Summary from Dashboard:`);
    console.log(`  Total DTEs: ${data.summary?.dtes?.total || 0}`);
    console.log(`  Unpaid DTEs: ${data.summary?.dtes?.unpaid || 0}`);
    console.log(`  Pending DTEs (list): ${data.pending?.dtes?.length || 0}\n`);

    const dtes = data.pending?.dtes || [];

    if (dtes.length === 0) {
        console.log('❌ No DTEs found in database for January 2026');
        return;
    }

    // Group by amount range
    const ranges = [
        { min: 0, max: 100000, label: '$0 - $100k', dtes: [] },
        { min: 100000, max: 1000000, label: '$100k - $1M', dtes: [] },
        { min: 1000000, max: 10000000, label: '$1M - $10M', dtes: [] },
        { min: 10000000, max: Infinity, label: '$10M+', dtes: [] }
    ];

    dtes.forEach(dte => {
        const amount = dte.totalAmount || 0;
        const range = ranges.find(r => amount >= r.min && amount < r.max);
        if (range) range.dtes.push(dte);
    });

    console.log('📊 DTEs in Database by Amount Range:');
    ranges.forEach(range => {
        console.log(`\n  ${range.label}: ${range.dtes.length} DTEs`);
        if (range.dtes.length > 0 && range.dtes.length <= 5) {
            range.dtes.forEach(dte => {
                console.log(`    - Folio ${dte.folio}: $${dte.totalAmount.toLocaleString()} (${dte.issuedDate?.split('T')[0]})`);
            });
        }
    });

    // Check specifically for Entel invoice
    console.log('\n🎯 Searching for Entel invoice (Folio 52707976, ~$89k):');
    const entelDte = dtes.find(dte => dte.folio === 52707976 || (dte.totalAmount >= 88000 && dte.totalAmount <= 91000));

    if (entelDte) {
        console.log(`  ✅ FOUND: Folio ${entelDte.folio}, Amount: $${entelDte.totalAmount.toLocaleString()}`);
    } else {
        console.log(`  ❌ NOT FOUND in database`);
        console.log(`  This means the DTE exists in LibreDTE but was not saved to the database.`);
    }
}

checkProductionDtes().catch(console.error);
