import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    // Search for folio 10610
    const dtes = await prisma.dTE.findMany({
        where: { folio: 10610 },
        include: {
            provider: { select: { name: true, rut: true } },
            matches: { select: { id: true, status: true, transactionId: true } },
        }
    });

    console.log(`DTEs with folio 10610: ${dtes.length}`);
    for (const d of dtes) {
        console.log(`  ID: ${d.id}`);
        console.log(`  Folio: ${d.folio} | Type: ${d.type} | Amount: $${d.totalAmount}`);
        console.log(`  Provider: ${d.provider?.name} (${d.provider?.rut})`);
        console.log(`  Issued: ${d.issuedDate.toISOString().split('T')[0]} | PayStatus: ${d.paymentStatus}`);
        console.log(`  OrgId: ${d.organizationId}`);
        console.log(`  Matches: ${d.matches.length}`, d.matches);
        console.log('');
    }

    // Also check the TX
    const tx = await prisma.bankTransaction.findFirst({
        where: { 
            amount: -157992,
            date: { 
                gte: new Date('2026-01-04'), 
                lte: new Date('2026-01-14') 
            }
        },
        include: { matches: { select: { id: true, status: true, dteId: true } } }
    });

    if (tx) {
        console.log('Matching TX found:');
        console.log(`  ID: ${tx.id}`);
        console.log(`  "${tx.description}" | $${tx.amount} | ${tx.date.toISOString().split('T')[0]} | Status: ${tx.status}`);
        console.log(`  Matches:`, tx.matches);
    }

    // Check also folio 10609
    const dte2 = await prisma.dTE.findMany({
        where: { folio: { in: [10609, 10610] } },
        select: { id: true, folio: true, totalAmount: true, paymentStatus: true, organizationId: true, provider: { select: { name: true } } }
    });
    console.log('\nFolios 10609 & 10610:');
    for (const d of dte2) {
        console.log(`  F${d.folio} | $${d.totalAmount} | ${d.paymentStatus} | Org: ${d.organizationId} | ${d.provider?.name}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
