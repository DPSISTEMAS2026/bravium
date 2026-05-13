import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const EMAIL = 'tamara.leyton@bravium.io';
    const NEW_PASSWORD = 'Bravium2026!';

    console.log(`\n🔍 Buscando usuario: ${EMAIL}...`);

    // 1. Check if user exists
    const existingUser = await prisma.user.findUnique({
        where: { email: EMAIL },
        include: { organization: true },
    });

    const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);

    if (existingUser) {
        // User exists — update password
        console.log(`✅ Usuario encontrado: ${existingUser.fullName} (Org: ${existingUser.organization?.name})`);
        console.log(`🔑 Actualizando contraseña...`);

        await prisma.user.update({
            where: { email: EMAIL },
            data: { passwordHash },
        });

        console.log(`✅ Contraseña actualizada exitosamente.`);
        printSummary(existingUser.fullName, EMAIL, NEW_PASSWORD, existingUser.role, existingUser.organization?.name || 'N/A');
    } else {
        // User does NOT exist — create it
        console.log(`⚠️ Usuario no encontrado. Creando usuario...`);

        // Find the Bravium organization
        const org = await prisma.organization.findFirst({
            where: { name: { contains: 'BRAVIUM', mode: 'insensitive' } },
        });

        if (!org) {
            console.error('❌ No se encontró la organización BRAVIUM.');
            process.exit(1);
        }

        const newUser = await prisma.user.create({
            data: {
                email: EMAIL,
                fullName: 'Tamara Leyton',
                passwordHash,
                role: UserRole.COMPRAS,
                organizationId: org.id,
            },
        });

        console.log(`✅ Usuario creado exitosamente.`);
        printSummary(newUser.fullName, newUser.email, NEW_PASSWORD, newUser.role, org.name);
    }
}

function printSummary(name: string, email: string, password: string, role: string, org: string) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 RESUMEN`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Nombre:       ${name}`);
    console.log(`  Email:        ${email}`);
    console.log(`  Contraseña:   ${password}`);
    console.log(`  Rol:          ${role}`);
    console.log(`  Organización: ${org}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main()
    .catch((e) => {
        console.error('❌ Error:', e.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
