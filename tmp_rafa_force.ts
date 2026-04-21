import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Forzando TODAS las transacciones de Rafael Fuentes a MATCHED...');
    const txs = await prisma.bankTransaction.findMany({
        where: {
            status: { in: ['PENDING', 'UNMATCHED', 'PARTIALLY_MATCHED'] }
        }
    });

    let updated = 0;
    for (const tx of txs) {
        const meta: any = tx.metadata || {};
        const lowerDesc = tx.description.toLowerCase();
        const descMatch = lowerDesc.includes('16.751.150') || lowerDesc.includes('16751150') || lowerDesc.includes('rafael fuente') || lowerDesc.includes('16.751.160') || lowerDesc.includes('16751160');
        
        if (descMatch || meta?.providerName === 'Rafael Fuentes' || meta?.excelItem === 'RAFAEL FUENTES') {
            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: {
                    status: 'MATCHED',
                    metadata: {
                        ...meta,
                        reviewNote: 'Revisado y Sellado (Boleta Honorarios Rafael Fuentes)',
                        providerName: 'RAFAEL FUENTES'
                    }
                }
            });
            console.log(`Sellado manual aplicado a Tx Rafael: ${tx.date.toISOString().split('T')[0]} - $${Math.abs(tx.amount)}`);
            updated++;
        }
    }
    console.log(`Total actualizado a MATCHED (Review) para Rafael: ${updated}`);
}

main().finally(() => setTimeout(() => process.exit(0), 10));
