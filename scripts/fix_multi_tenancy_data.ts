import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const braviumId = '715545b8-4522-4bb1-be81-3047546c0e8c';

    console.log(`Assigning missing organizationId to Bravium (${braviumId})...`);

    const updateMatches = await prisma.reconciliationMatch.updateMany({
        where: { organizationId: null },
        data: { organizationId: braviumId }
    });
    console.log(`- Updated ${updateMatches.count} ReconciliationMatches`);

    const updateSuggestions = await prisma.matchSuggestion.updateMany({
        where: { organizationId: null },
        data: { organizationId: braviumId }
    });
    console.log(`- Updated ${updateSuggestions.count} MatchSuggestions`);

    const updatePaymentRecords = await prisma.paymentRecord.updateMany({
        where: { organizationId: null },
        data: { organizationId: braviumId }
    });
    console.log(`- Updated ${updatePaymentRecords.count} PaymentRecords`);

    const updatePeriods = await prisma.accountingPeriod.updateMany({
        where: { organizationId: null },
        data: { organizationId: braviumId }
    });
    console.log(`- Updated ${updatePeriods.count} AccountingPeriods`);

    console.log("Migration complete.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
