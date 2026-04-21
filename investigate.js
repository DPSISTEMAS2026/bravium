const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const providers = await prisma.provider.findMany({
        where: { currentBalance: { gt: 0 } },
        take: 5,
        orderBy: { currentBalance: 'desc' },
        select: { id: true, name: true, currentBalance: true }
    });
    for (const p of providers) {
        const dtes2026 = await prisma.dTE.aggregate({
            where: { providerId: p.id, paymentStatus: 'UNPAID', issuedDate: { gte: new Date('2026-01-01') } },
            _sum: { outstandingAmount: true }
        });
        const dtesTotal = await prisma.dTE.aggregate({
            where: { providerId: p.id, paymentStatus: 'UNPAID' },
            _sum: { outstandingAmount: true }
        });
        console.log(`Provider: ${p.name}, Cache Balance: ${p.currentBalance}, UNPAID DTEs 2026+: ${dtes2026._sum.outstandingAmount}, UNPAID DTEs Total: ${dtesTotal._sum.outstandingAmount}`);
    }
    console.log('Done');
}
main().catch(console.error).finally(()=>prisma.$disconnect());
