const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
    console.log('=== DIAGNOSTIC: Why Auto-Match Found 0 Matches ===\n');

    // 1. Check Transactions
    const txs = await prisma.bankTransaction.findMany({
        where: {
            date: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') },
            status: 'PENDING'
        },
        take: 5,
        orderBy: { amount: 'desc' }
    });

    console.log('📊 SAMPLE PENDING TRANSACTIONS (Top 5 by amount):');
    txs.forEach(tx => {
        console.log(`  Date: ${tx.date.toISOString().split('T')[0]} | Amount: $${Math.abs(tx.amount).toLocaleString()} | Desc: ${tx.description}`);
    });

    // 2. Check DTEs
    const dtes = await prisma.dTE.findMany({
        where: {
            issuedDate: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') }
        },
        take: 5,
        orderBy: { totalAmount: 'desc' }
    });

    console.log('\n📄 SAMPLE DTES (Top 5 by amount):');
    dtes.forEach(dte => {
        console.log(`  Date: ${dte.issuedDate.toISOString().split('T')[0]} | Amount: $${dte.totalAmount.toLocaleString()} | Folio: ${dte.folio}`);
    });

    // 3. Check for potential matches manually
    console.log('\n🔍 POTENTIAL MATCHES (Amount within $1000):');
    let foundPotential = false;

    for (const tx of txs) {
        const txAmount = Math.abs(tx.amount);
        for (const dte of dtes) {
            const diff = Math.abs(txAmount - dte.totalAmount);
            if (diff <= 1000) {
                const daysDiff = Math.abs((tx.date - dte.issuedDate) / (1000 * 60 * 60 * 24));
                console.log(`  ✓ TX: $${txAmount.toLocaleString()} (${tx.date.toISOString().split('T')[0]}) ↔️ DTE: $${dte.totalAmount.toLocaleString()} (${dte.issuedDate.toISOString().split('T')[0]})`);
                console.log(`    Diff: $${diff} | Days apart: ${Math.round(daysDiff)}`);
                foundPotential = true;
            }
        }
    }

    if (!foundPotential) {
        console.log('  ❌ No potential matches found in sample data');
        console.log('\n💡 POSSIBLE REASONS:');
        console.log('  1. Transaction amounts are NEGATIVE (debits) but DTEs are POSITIVE');
        console.log('  2. Amounts don\'t match within $1000 tolerance');
        console.log('  3. Dates are too far apart (>120 days)');
        console.log('  4. All transactions already matched (status != PENDING)');
    }

    // 4. Check transaction status distribution
    const statusCount = await prisma.bankTransaction.groupBy({
        by: ['status'],
        where: {
            date: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') }
        },
        _count: true
    });

    console.log('\n📈 TRANSACTION STATUS DISTRIBUTION:');
    statusCount.forEach(s => {
        console.log(`  ${s.status}: ${s._count} transactions`);
    });

    await prisma.$disconnect();
}

diagnose().catch(console.error);
