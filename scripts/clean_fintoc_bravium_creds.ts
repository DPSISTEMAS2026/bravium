import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Removiendo credenciales de Fintoc del perfil de Bravium...");

    const bravium = await prisma.organization.findFirst({
        where: { slug: 'bravium' }
    });

    if (!bravium) {
        console.error("Organización Bravium no encontrada.");
        return;
    }

    // Limpiar las credenciales de Fintoc en el perfil de la Organización
    await prisma.organization.update({
        where: { id: bravium.id },
        data: {
            fintocApiKey: null,
            fintocPublicKey: null,
            fintocLinkToken: null
        }
    });

    console.log("Credenciales Fintoc de Bravium removidas.");
    console.log(`✅ ¡Limpieza completada al 100%!`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
