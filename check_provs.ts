import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const p = await prisma.provider.findMany({ where: { name: { contains: 'SAFFORE', mode: 'insensitive' } } });
    console.log(p);
    
    // Also check Rafael
    const r = await prisma.provider.findMany({ where: { name: { contains: 'RAFAEL', mode: 'insensitive' } } });
    console.log('Rafaels:', r.map((x:any) => x.name));

    await prisma.$disconnect();
}
main();
