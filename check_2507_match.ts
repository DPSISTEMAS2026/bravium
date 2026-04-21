import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const dte = await prisma.dTE.findUnique({
        where: { id: '4ab0b7c1-b95b-404b-8898-b4f0105a4050' },
        include: { matches: true }
    });
    console.log('Matches para 2507:', dte?.matches);
    await prisma.$disconnect();
}
main();
