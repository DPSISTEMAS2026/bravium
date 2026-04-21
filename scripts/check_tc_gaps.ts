import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const txs = await prisma.bankTransaction.findMany({
        where: { bankAccountId: 'acc-santander-5239' },
        orderBy: { date: 'asc' }
    });

    const dates = txs.map(t => typeof t.date === 'string' ? new Date(t.date) : t.date);
    
    // Sort just in case
    dates.sort((a,b) => a.getTime() - b.getTime());

    let maxGapInt = 0;
    let gapStart = null;
    let gapEnd = null;

    for (let i = 1; i < dates.length; i++) {
        const diffDays = (dates[i].getTime() - dates[i-1].getTime()) / (1000 * 3600 * 24);
        if (diffDays > maxGapInt) {
            maxGapInt = diffDays;
            gapStart = dates[i-1];
            gapEnd = dates[i];
        }
    }

    console.log(`Mayor brecha de días en la Tarjeta de Crédito: ${Math.round(maxGapInt)} días.`);
    if (gapStart && gapEnd) {
        console.log(`Entre ${gapStart.toISOString().split('T')[0]} y ${gapEnd.toISOString().split('T')[0]}`);
    }
}

main().finally(() => prisma.$disconnect());
