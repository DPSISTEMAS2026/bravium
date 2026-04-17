import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Searching for Fintoc transactions with midnight UTC dates...");
    
    const transactions = await prisma.bankTransaction.findMany({
        where: { origin: 'API_INTEGRATION' }
    });

    let updatedCount = 0;

    for (const tx of transactions) {
        // Only fix dates that are exactly at 00:00:00 UTC
        if (tx.date.getUTCHours() === 0 && tx.date.getUTCMinutes() === 0 && tx.date.getUTCSeconds() === 0) {
            const rawDate = tx.metadata && typeof tx.metadata === 'object' && (tx.metadata as any).raw?.post_date;
            if (rawDate && typeof rawDate === 'string' && rawDate.includes('T00:00:00Z')) {
                const newDate = new Date(tx.date);
                newDate.setUTCHours(12, 0, 0, 0);
                
                await prisma.bankTransaction.update({
                    where: { id: tx.id },
                    data: { date: newDate }
                });
                
                console.log(`Updated TX ${tx.id} - ${tx.description} from ${tx.date.toISOString()} to ${newDate.toISOString()}`);
                updatedCount++;
            }
        }
    }

    console.log(`Finished. Updated ${updatedCount} Fintoc transactions.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
