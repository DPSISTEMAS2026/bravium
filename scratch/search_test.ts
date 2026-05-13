import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const raw = "215601";
    const digitsOnly = raw.replace(/\D/g, '');
    const orConditions: any[] = [
        { description: { contains: raw, mode: 'insensitive' } },
        { reference: { contains: raw, mode: 'insensitive' } },
    ];
    if (digitsOnly.length >= 2) {
        const amountNum = parseInt(digitsOnly, 10);
        if (!isNaN(amountNum) && amountNum > 0) {
            orConditions.push({ amount: amountNum }, { amount: -amountNum });
        }
    }
    
    // Check if there are ANY transactions with null reference
    const nullRef = await prisma.bankTransaction.findFirst({
        where: { reference: null }
    });
    console.log("Null ref exists:", !!nullRef);
    
    const res = await prisma.bankTransaction.findMany({
        where: {
            OR: orConditions
        },
        take: 5
    });
    console.log("Res length:", res.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
