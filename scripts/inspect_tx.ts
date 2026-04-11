import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const t = await prisma.bankTransaction.findFirst({
        where: {
            date: {
                gte: new Date('2026-03-20'),
                lt: new Date('2026-03-21')
            }
        }
    });

    console.log(JSON.stringify(t, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
