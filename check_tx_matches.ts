import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const tx = await prisma.bankTransaction.findUnique({ 
        where: { id: "915e0095-d999-459e-8dc5-1780c1d15cb9" },
        include: {
            matches: {
                include: { dte: true }
            }
        }
    });
    console.log(JSON.stringify(tx, null, 2));
    await prisma.$disconnect();
}
main().catch(console.error);
