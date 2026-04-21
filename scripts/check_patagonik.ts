import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const provider = await prisma.provider.findFirst({
        where: { name: { contains: 'PATAGONIK' } },
        include: { dtes: true }
    });
    if (!provider) {
        console.log('Not found');
        return;
    }
    
    console.log(`Provider: ${provider.name}`);
    let sumUnpaid = 0;
    let sumTotal = 0;
    const unpaidDtes = [];
    
    for (const d of provider.dtes) {
        if (d.type === 61) continue; // skip NC
        sumTotal += d.totalAmount;
        if (d.paymentStatus === 'UNPAID' || d.paymentStatus === 'PARTIAL') {
            sumUnpaid += d.outstandingAmount;
            unpaidDtes.push({ folio: d.folio, amt: d.outstandingAmount, date: d.issuedDate });
        }
    }
    console.log(`Calculated unpaid (excluding NC): ${sumUnpaid}`);
    console.log(unpaidDtes);
    
    // Now let's calculate the same way the dashboard might be doing it
    let rawSumUnpaid = 0;
    for (const d of provider.dtes) {
        if (d.outstandingAmount > 0) {
            rawSumUnpaid += d.outstandingAmount;
        }
    }
    console.log(`Raw sum of all outstandingAmount > 0 (even if paid or NC): ${rawSumUnpaid}`);
}

main().finally(() => setTimeout(() => process.exit(0), 10));
