import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    console.log("Updating bankAccountId...");
    const res = await prisma.bankTransaction.updateMany({
        where: {
            metadata: {
                path: ['sourceFile'],
                equals: 'Ultimos movimientos_nac16_04_2026 (1).xlsm'
            }
        },
        data: {
            bankAccountId: 'acc-santander-5239'
        }
    });
    console.log('Updated:', res);
    await prisma.$disconnect();
}
main();
