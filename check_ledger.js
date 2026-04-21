const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const providers = await prisma.provider.findMany({
        where: { currentBalance: { gt: 0 } },
        take: 2,
        orderBy: { currentBalance: 'desc' },
        select: { id: true, name: true, currentBalance: true }
    });
    for (const p of providers) {
        const ledgerSum = await prisma.financialLedgerEntry.aggregate({
            where: { providerId: p.id },
            _sum: { amount: true }
        });
        console.log(`Provider: ${p.name}, Cache Balance: ${p.currentBalance}, Ledger Sum: ${ledgerSum._sum.amount}`);
    }
    console.log('Done');
}
main().catch(console.error).finally(()=>prisma.$disconnect());
