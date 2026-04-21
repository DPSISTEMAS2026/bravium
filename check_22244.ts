import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Buscando Folio 22244 de VINIMPORT");
    const dte = await prisma.dTE.findMany({ 
        where: { folio: 22244 }, 
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
