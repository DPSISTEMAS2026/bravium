import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const ORG_ID = '715545b8-4522-4bb1-be81-3047546c0e8c';

async function main() {
    const p = await prisma.provider.findMany({ where: { name: { contains: 'SAFFORE', mode: 'insensitive' } } });
    if (p.length === 0) {
        console.log('No existe Arturo Saffore. Creándolo...');
        await prisma.provider.create({
            data: {
                organizationId: ORG_ID,
                name: 'Arturo Saffore',
                rut: '0-0', // RUT por defecto
                category: 'HONORARIOS'
            }
        });
        console.log('Proveedor creado exitosamente.');
    } else {
        console.log('Ya existe:', p);
    }

    await prisma.$disconnect();
}
main();
