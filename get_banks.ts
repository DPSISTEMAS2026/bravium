import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const acc = await prisma.bankAccount.findMany({ select: { id: true, bankName: true, accountNumber: true } });
    console.log(acc);
    await prisma.$disconnect();
}
main();
