import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const orgId = '715545b8-4522-4bb1-be81-3047546c0e8c'; // Bravium
    const accs = await prisma.bankAccount.findMany({ 
        where: { organizationId: orgId }, 
        include: { _count: { select: { transactions: true } } } 
    }); 
    console.log(JSON.stringify(accs, null, 2));
}

main().finally(() => prisma.$disconnect());
