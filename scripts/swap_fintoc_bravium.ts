import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const dpSistemas = await prisma.organization.findFirst({
        where: { name: { contains: 'DP Sistemas' } }
    });

    const bravium = await prisma.organization.findFirst({
        where: { slug: 'bravium' }
    });

    if (!dpSistemas || !bravium) {
        console.error("No se encontraron las organizaciones", { dpSistemas: !!dpSistemas, bravium: !!bravium });
        return;
    }

    console.log(`Moviendo credenciales de Fintoc de ${dpSistemas.name} a ${bravium.name}...`);

    // 1. Guardar credenciales actuales de DP Sistemas
    const fintocApiKey = dpSistemas.fintocApiKey;
    const fintocPublicKey = dpSistemas.fintocPublicKey;
    const fintocLinkToken = dpSistemas.fintocLinkToken;

    if (!fintocApiKey) {
        console.log("DP Sistemas no tiene apiKey de Fintoc para copiar. Se usarán las de producción hardcodeadas si es necesario.");
    }

    // Usar las credenciales reales de Fintoc detectadas
    const realApiKey = fintocApiKey || 'sk_live_dv8WTJro5_iav9pzz83mzj1m88BpFchosh4t_yssr4x';
    const realPublicKey = fintocPublicKey || 'pk_live_A9pZ1bMJBDT-PzeRzXRD1T57ouoUY1x5P3MFmVxiFpQ';
    const realLinkToken = fintocLinkToken || 'link_q0zCrdi0Pe48LEJ3';

    // 2. Asignar a Bravium
    await prisma.organization.update({
        where: { id: bravium.id },
        data: {
            fintocApiKey: realApiKey,
            fintocPublicKey: realPublicKey,
            fintocLinkToken: realLinkToken,
        }
    });

    console.log(`✅ Credenciales asignadas a ${bravium.name}`);

    // 3. Limpiar DP Sistemas para que no se duplique la sincronización
    await prisma.organization.update({
        where: { id: dpSistemas.id },
        data: {
            fintocApiKey: null,
            fintocPublicKey: null,
            fintocLinkToken: null,
        }
    });

    console.log(`✅ Credenciales removidas de ${dpSistemas.name}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
