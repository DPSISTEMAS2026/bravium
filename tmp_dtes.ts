import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const dtes = await prisma.dTE.findMany({
        where: { paymentStatus: 'UNPAID', outstandingAmount: 0 },
        select: { id: true, folio: true, totalAmount: true }
    });
    console.log(`Unpaid with amt=0: ${dtes.length}`);
    if (dtes.length > 0) {
        console.log(dtes.slice(0, 5));
    }
}
main().finally(() => setTimeout(() => process.exit(0), 10));
