import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const txs = await prisma.bankTransaction.findMany({
        where: {
            status: { in: ['PENDING', 'UNMATCHED'] }
        }
    });

    let updated = 0;
    for (const tx of txs) {
        const meta = tx.metadata as any;
        const descMatch = tx.description.toLowerCase().includes('16.751.160') || tx.description.toLowerCase().includes('16751160') || tx.description.toLowerCase().includes('rafael fuente');
        if (descMatch || (meta && meta.excelItem === 'RAFAEL FUENTES')) {
            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: {
                    status: 'MATCHED',
                    metadata: {
                        ...(meta || {}),
                        reviewNote: 'Revisado (Boleta Honorarios Rafael Fuentes)',
                        providerName: 'RAFAEL FUENTES'
                    }
                }
            });
            console.log(`Revisado manual aplicado a Tx Rafael: ${tx.date.toISOString().split('T')[0]} - $${tx.amount}`);
            updated++;
        }
    }
    console.log(`Total actualizado a MATCHED (Review) para Rafael: ${updated}`);
}

main().finally(() => setTimeout(() => process.exit(0), 10));
