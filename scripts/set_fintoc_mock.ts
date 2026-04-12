import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const org = await prisma.organization.findFirst({
        where: { name: { contains: 'DP Sistemas' } }
    });

    if (org) {
        console.log(`Setting Fintoc mockup credentials for ${org.name}...`);
        await prisma.organization.update({
            where: { id: org.id },
            data: {
                fintocApiKey: 'sk_test_mock_dp_sistemas',
                fintocLinkToken: 'lt_mock_dp_sistemas'
            }
        });
        console.log("Done.");
    } else {
        console.log("DP Sistemas org not found.");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
