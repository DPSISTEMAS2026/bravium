import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const txs = await prisma.bankTransaction.findMany({
        where: { amount: { in: [-288960, 288960] } },
        include: { bankAccount: true, matches: true }
    });

    console.log(`Found ${txs.length} transactions with amount 288960`);
    for (const t of txs) {
        console.log(`- ${t.date.toISOString().split('T')[0]} | ${t.description} | ${t.amount} | ${t.type} | Bank: ${t.bankAccount?.bankName} | Matches: ${t.matches.length} | Meta: ${JSON.stringify(t.metadata)}`);
    }
    await prisma.$disconnect();
}
run();
