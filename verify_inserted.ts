import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const tx = await prisma.bankTransaction.findFirst({
        where: { amount: { in: [288960, -288960] } },
        include: { bankAccount: true }
    });
    console.log(tx);
    await prisma.$disconnect();
}
main();
