import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Finding potential duplicate bank transactions ---');
    
    // We search for transactions with same amount, date and similar descriptions on the same day
    const allTxs = await prisma.bankTransaction.findMany({
        orderBy: { date: 'asc' }
    });

    const duplicates: any[] = [];
    for (let i = 0; i < allTxs.length; i++) {
        for (let j = i + 1; j < allTxs.length; j++) {
            const tx1 = allTxs[i];
            const tx2 = allTxs[j];

            if (tx1.amount === tx2.amount && 
                tx1.date.getTime() === tx2.date.getTime() &&
                (tx1.description.includes(tx2.description.slice(0, 10)) || tx2.description.includes(tx1.description.slice(0, 10)))) {
                duplicates.push([tx1, tx2]);
            }
        }
    }

    console.log(`Found ${duplicates.length} potential duplicate pairs`);
    duplicates.slice(0, 20).forEach(([tx1, tx2]) => {
        console.log(`Pair: 
  A: ${tx1.id} | ${tx1.description} | ${tx1.amount} | ${tx1.status}
  B: ${tx2.id} | ${tx2.description} | ${tx2.amount} | ${tx2.status}`);
    });
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
