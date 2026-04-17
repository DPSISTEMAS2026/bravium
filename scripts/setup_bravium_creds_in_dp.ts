import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'contacto@dpsistemas.cl' },
        include: { organization: true }
    });
    
    if (!user) {
        console.error("User contacto@dpsistemas.cl no encontrado.");
        return;
    }
    console.log("Organización actual del usuario:", user.organization?.name);
    
    const dpOrg = user.organization;
    if (!dpOrg) return;

    // Actualizar credenciales de Bravium (Santander e Itau) en la organización de DP Sistemas
    // Para simplificar y soportar multiples tokens sin cambiar el esquema, 
    // guardaremos los dos tokens unidos por una coma.
    // Luego modificaremos el servicio de Fintoc para que haga un split.
    await prisma.organization.update({
        where: { id: dpOrg.id },
        data: {
            fintocApiKey: 'sk_live_6ct1qeB_CSKUY_u3PzJaMuos-Cmt_9qr4VtT39fHykM',
            fintocPublicKey: 'pk_live_Zy2VoYQT3AYepqtFnzG6v_9yAxpgFjfTGM79Vf2WeKk',
            fintocLinkToken: 'link_J0WLYbi4RwEZXxAB_token_YdkzD6wkjxPwiHrcpmd-8LdS,link_jplGZ1ilzbBNX50K_token_Qrqye-jziYgyM5xVLsdgyUE',
        }
    });

    console.log(`Credenciales actualizadas en la organización: ${dpOrg.name}`);
}

main().finally(() => prisma.$disconnect());
