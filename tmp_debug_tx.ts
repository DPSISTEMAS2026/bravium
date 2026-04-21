import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const tx = await prisma.bankTransaction.findUnique({
        where: { id: 'eec17698-35ed-4e89-aec4-22b274533da4' }
    });
    console.log(tx);
    const lowerDesc = tx.description.toLowerCase();
    const descMatch = lowerDesc.includes('16.751.150') || lowerDesc.includes('16751150') || lowerDesc.includes('rafael fuente');
    console.log("Includes 16.751.150?", lowerDesc.includes('16.751.150'));
    console.log("descMatch: ", descMatch);
}

main().finally(() => setTimeout(() => process.exit(0), 10));
