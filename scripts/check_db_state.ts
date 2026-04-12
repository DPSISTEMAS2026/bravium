import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const orgs = await prisma.organization.findMany();
    console.log("Organizations:");
    orgs.forEach(o => console.log(`- ${o.name} (${o.id}) slug: ${o.slug}`));

    const tables = [
        'organization',
        'user',
        'bankAccount',
        'bankTransaction',
        'provider',
        'dTE',
        'reconciliationMatch',
        'payment'
    ];

    console.log("\nCounts by Organization (null means global/unassigned):");
    for (const table of tables) {
        try {
            const counts = await (prisma[table] as any).groupBy({
                by: ['organizationId'],
                _count: true
            });
            console.log(`\nTable: ${table}`);
            counts.forEach((c: any) => {
                console.log(`  OrgID: ${c.organizationId || 'NULL'} -> Count: ${c._count}`);
            });
        } catch (err) {
            // Some tables might not have organizationId directly
            if (table === 'bankTransaction') {
                const count = await prisma.bankTransaction.count();
                console.log(`  Table: bankTransaction (total): ${count} (Isolated via BankAccount)`);
                const accounts = await prisma.bankAccount.findMany({ select: { id: true, organizationId: true } });
                const accountMap = new Map(accounts.map(a => [a.id, a.organizationId]));
                const nullAccountIds = accounts.filter(a => !a.organizationId).map(a => a.id);
                const nullTxCount = await prisma.bankTransaction.count({ where: { bankAccountId: { in: nullAccountIds } } });
                console.log(`  - Txs with Null Org Account: ${nullTxCount}`);
            } else {
                console.log(`  Table: ${table} - Error grouping by org: ${err.message}`);
            }
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
