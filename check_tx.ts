
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking transactions...');
    const count = await prisma.bankTransaction.count();
    console.log(`Total Transactions: ${count}`);

    const sample = await prisma.bankTransaction.findMany({ take: 5 });
    console.log('Sample:', JSON.stringify(sample, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
