import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const org = await prisma.organization.findFirst({
        where: { name: { contains: 'DP Sistemas' } }
    });

    if (org) {
        console.log(`Setting REAL Fintoc credentials for ${org.name}...`);
        await prisma.organization.update({
            where: { id: org.id },
            data: {
                fintocApiKey: 'sk_live_dv8WTJro5_iav9pzz83mzj1m88BpFchosh4t_yssr4x',
                fintocPublicKey: 'pk_live_A9pZ1bMJBDT-PzeRzXRD1T57ouoUY1x5P3MFmVxiFpQ'
            }
        });
        console.log("Done.");
    } else {
        console.log("DP Sistemas org not found.");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
