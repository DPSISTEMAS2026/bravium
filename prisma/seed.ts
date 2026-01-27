import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const passwordHash = await bcrypt.hash('admin123', 10);

    const org = await prisma.organization.upsert({
        where: { rut: '77777777-7' },
        update: {},
        create: {
            rut: '77777777-7',
            name: 'BRAVIUM CHILE',
            plan: 'ENTERPRISE',
        },
    });

    await prisma.user.upsert({
        where: { email: 'admin@bravium.cl' },
        update: {},
        create: {
            email: 'admin@bravium.cl',
            passwordHash,
            fullName: 'Administrador Bravium',
            role: UserRole.ADMIN,
            organizationId: org.id,
        },
    });

    console.log('Seed completed: Admin user created.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
