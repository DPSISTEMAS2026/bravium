import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const tx = await prisma.bankTransaction.findFirst({ where: { amount: { in: [288960, -288960] } } });
    console.log(tx);
    const existingCount = await prisma.bankTransaction.count({
        where: {
            bankAccountId: "75db1d4e-b816-43bf-b586-21ce9bdec5ca",
            amount: 288960
        }
    });
    console.log('existing count:', existingCount);
    await prisma.$disconnect();
}
main();
