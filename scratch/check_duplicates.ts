import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking for duplicate transactions with amount 2566663 ---');
    const txs = await prisma.bankTransaction.findMany({
        where: {
            amount: -2566663, // It's a cargo (negative if represented strictly) or 2566663 if positive. 
            // In the screenshot it says $-2.566.663
        },
        include: {
            matches: true,
        }
    });

    console.log(`Found ${txs.length} transactions with amount 2566663`);
    txs.forEach(tx => {
        console.log(`ID: ${tx.id}, Date: ${tx.date}, Desc: ${tx.description}, Status: ${tx.status}, Matches: ${tx.matches.length}`);
    });

    console.log('\n--- Checking for DTE Folio 2812 ---');
    const dtes = await prisma.dTE.findMany({
        where: { folio: 2812 },
        include: {
            matches: {
                include: {
                    transaction: true
                }
            }
        }
    });

    dtes.forEach(dte => {
        console.log(`DTE ID: ${dte.id}, Folio: ${dte.folio}, Total: ${dte.totalAmount}, Matches: ${dte.matches.length}`);
        dte.matches.forEach(m => {
            console.log(`  Match ID: ${m.id}, Status: ${m.status}, Tx ID: ${m.transactionId}, Tx Desc: ${m.transaction?.description}`);
        });
    });
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
