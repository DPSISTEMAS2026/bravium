const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data/dtes_enero_2026.json', 'utf-8'));

console.log('📊 DTEs in local file:');
console.log(`  Total: ${data.length}\n`);

const ranges = [
    { min: 0, max: 100000, label: '$0-$100k' },
    { min: 100000, max: 1000000, label: '$100k-$1M' },
    { min: 1000000, max: 10000000, label: '$1M-$10M' },
    { min: 10000000, max: Infinity, label: '$10M+' }
];

console.log('Amount distribution:');
ranges.forEach(r => {
    const count = data.filter(d => {
        const amt = d.total || d.monto_total || 0;
        return amt >= r.min && amt < r.max;
    }).length;
    console.log(`  ${r.label}: ${count}`);
});

const entel = data.find(d => d.folio === 52707976);
console.log(`\n🎯 Entel invoice (Folio 52707976): ${entel ? '✅ FOUND' : '❌ NOT FOUND'}`);

if (entel) {
    console.log(`   Amount: $${entel.total || entel.monto_total}`);
    console.log(`   Date: ${entel.fecha}`);
}
