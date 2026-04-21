import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const acc = await prisma.bankAccount.findFirst();
    if (acc) {
        console.log(acc.id);
    }
}
main();
