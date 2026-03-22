// Search for specific DTE amount in LibreDTE
const API_KEY = 'WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==';
const COMPANY_RUT = '77154188';
const API_URL = 'https://libredte.cl/api';

async function searchEntelInvoice() {
    console.log('🔍 Searching for Entel invoice (~$89,839) in LibreDTE...\n');

    const url = `${API_URL}/dte/dte_recibidos/buscar/${COMPANY_RUT}?_contribuyente_rut=${COMPANY_RUT}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${API_KEY}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fecha_desde: '2026-01-01',
            fecha_hasta: '2026-01-31',
            limit: 1000
        })
    });

    console.log(`Response Status: ${response.status}`);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error: ${errorText}`);
        return;
    }

    const rawText = await response.text();
    let cleanedText = rawText;
    if (rawText.includes('<br />')) {
        const jsonStart = rawText.indexOf('[');
        if (jsonStart !== -1) {
            cleanedText = rawText.substring(jsonStart);
        }
    }

    const dtes = JSON.parse(cleanedText);

    console.log(`📊 Total DTEs received: ${dtes.length}\n`);

    // Search for amounts near 89,839
    const targetAmount = 89839;
    const tolerance = 1000;

    console.log(`🎯 Searching for amounts between $${(targetAmount - tolerance).toLocaleString()} and $${(targetAmount + tolerance).toLocaleString()}:\n`);

    const matches = dtes.filter(dte => {
        const amount = parseFloat(dte.total || dte.monto_total || 0);
        return Math.abs(amount - targetAmount) <= tolerance;
    });

    if (matches.length > 0) {
        console.log(`✅ Found ${matches.length} matching DTEs:`);
        matches.forEach(dte => {
            console.log(`  Folio: ${dte.folio}`);
            console.log(`  Amount: $${parseFloat(dte.total || dte.monto_total).toLocaleString()}`);
            console.log(`  Date: ${dte.fecha}`);
            console.log(`  Issuer: ${dte.razon_social || dte.emisor || 'N/A'}`);
            console.log(`  RUT: ${dte.rut || dte.emisor_rut || 'N/A'}`);
            console.log('');
        });
    } else {
        console.log('❌ No DTEs found near $89,839');
        console.log('\n📋 Sample of DTEs received (first 10):');
        dtes.slice(0, 10).forEach(dte => {
            const amount = parseFloat(dte.total || dte.monto_total || 0);
            console.log(`  $${amount.toLocaleString().padStart(12)} - Folio ${dte.folio} - ${dte.razon_social || dte.emisor || 'N/A'}`);
        });
    }

    // Also show amount distribution
    console.log('\n📊 Amount Distribution:');
    const ranges = [
        { min: 0, max: 100000, label: '$0 - $100k' },
        { min: 100000, max: 1000000, label: '$100k - $1M' },
        { min: 1000000, max: 10000000, label: '$1M - $10M' },
        { min: 10000000, max: Infinity, label: '$10M+' }
    ];

    ranges.forEach(range => {
        const count = dtes.filter(dte => {
            const amount = parseFloat(dte.total || dte.monto_total || 0);
            return amount >= range.min && amount < range.max;
        }).length;
        console.log(`  ${range.label}: ${count} DTEs`);
    });
}

searchEntelInvoice().catch(console.error);
