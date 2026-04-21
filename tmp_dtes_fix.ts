import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const dtes = await prisma.dTE.findMany({
        where: { paymentStatus: 'UNPAID', outstandingAmount: 0 }
    });
    console.log(`Fixing ${dtes.length} DTEs with corrupted outstandingAmount...`);
    for (const dte of dtes) {
        if (dte.totalAmount > 0) {
            await prisma.dTE.update({
                where: { id: dte.id },
                data: { outstandingAmount: dte.totalAmount }
            });
        }
    }
    console.log('Fixed.');
}
main().finally(() => setTimeout(() => process.exit(0), 10));
