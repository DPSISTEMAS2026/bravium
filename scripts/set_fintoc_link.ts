import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const org = await prisma.organization.findFirst({
        where: { name: { contains: 'DP Sistemas' } }
    });

    if (org) {
        console.log(`Setting Fintoc Link Token for ${org.name}...`);
        await prisma.organization.update({
            where: { id: org.id },
            data: {
                fintocLinkToken: 'link_q0zCrdi0Pe48LEJ3' // Identified from screenshot
            }
        });
        console.log("Done.");
    } else {
        console.log("DP Sistemas org not found.");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
