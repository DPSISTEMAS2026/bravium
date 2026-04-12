import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const bravium = await prisma.organization.findFirst({
        where: { name: { contains: 'Bravium' } }
    });

    if (!bravium) {
        console.error("Bravium org not found");
        return;
    }

    console.log(`Migrating data to Bravium (${bravium.id})...`);

    const updatedDte = await prisma.dTE.updateMany({
        where: { organizationId: null },
        data: { organizationId: bravium.id }
    });
    console.log(`Updated ${updatedDte.count} DTEs`);

    const updatedProviders = await prisma.provider.updateMany({
        where: { organizationId: null },
        data: { organizationId: bravium.id }
    });
    console.log(`Updated ${updatedProviders.count} Providers`);

    const updatedMatches = await prisma.reconciliationMatch.updateMany({
        where: { organizationId: null },
        data: { organizationId: bravium.id }
    });
    console.log(`Updated ${updatedMatches.count} ReconciliationMatches`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
