import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking Organizations ---');
    const orgs = await prisma.organization.findMany({
        where: { isActive: true }
    });

    for (const org of orgs) {
        console.log(`\nOrg: ${org.name} (${org.slug})`);
        console.log(`- ID: ${org.id}`);
        console.log(`- RUT: ${org.libreDteRut}`);
        console.log(`- API Key configured: ${org.libreDteApiKey ? 'YES' : 'NO'}`);
        console.log(`- Drive folder: ${org.googleDriveFolderId || 'NONE'}`);

        const lastDte = await prisma.dTE.findFirst({
            where: { provider: { organizationId: org.id } },
            orderBy: { issuedDate: 'desc' }
        });
        console.log(`- Last DTE issued date: ${lastDte?.issuedDate.toISOString() || 'NEVER'}`);

        const lastSync = await prisma.syncLog.findFirst({
            where: { organizationId: org.id },
            orderBy: { startedAt: 'desc' }
        });
        console.log(`- Last Sync Type: ${lastSync?.type || 'NONE'}`);
        console.log(`- Last Sync Status: ${lastSync?.status || 'NONE'}`);
        console.log(`- Last Sync Date: ${lastSync?.startedAt.toISOString() || 'NONE'}`);
        console.log(`- Last Sync Message: ${lastSync?.message || 'NONE'}`);
    }

    console.log('\n--- Recent Sync Logs (All) ---');
    const allLogs = await prisma.syncLog.findMany({
        orderBy: { startedAt: 'desc' },
        take: 20
    });
    
    for (const log of allLogs) {
        console.log(`[${log.startedAt.toISOString()}] ${log.type} | ${log.status} | Org: ${log.organizationId} | Msg: ${log.message}`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
