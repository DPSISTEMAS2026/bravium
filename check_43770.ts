import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const dte = await prisma.dTE.findMany({
        where: { folio: 43770 },
        include: {
            matches: {
                include: {
                    transaction: true
                }
            }
        }
    });

    console.log(JSON.stringify(dte, null, 2));
    await prisma.$disconnect();
}
main().catch(console.error);
