import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const accs = await prisma.bankAccount.findMany();
    console.log(JSON.stringify(accs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
