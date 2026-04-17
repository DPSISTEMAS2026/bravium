import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Limpiando Fintoc del perfil de Bravium...");

    const bravium = await prisma.organization.findFirst({
        where: { slug: 'bravium' }
    });

    if (!bravium) {
        console.error("Organización Bravium no encontrada.");
        return;
    }

    // 1. Encontrar las cuentas bancarias de Bravium que tengan "(Fintoc)" en el nombre
    const fintocAccounts = await prisma.bankAccount.findMany({
        where: {
            organizationId: bravium.id,
            bankName: { contains: 'Fintoc' }
        }
    });

    let totalDeleted = 0;
    for (const acc of fintocAccounts) {
        // En lugar de borrar transacciones sueltas, borramos todas las que estén atadas a esta cuenta Fintoc
        const deletedTxs = await prisma.bankTransaction.deleteMany({
            where: { bankAccountId: acc.id }
        });
        totalDeleted += deletedTxs.count;
        console.log(`Borradas ${deletedTxs.count} transacciones de la cuenta ${acc.bankName}`);

        // Borrar la cuenta bancaria de Fintoc
        await prisma.bankAccount.delete({
            where: { id: acc.id }
        });
        console.log(`Cuenta ${acc.bankName} borrada.`);
    }

    // Si por alguna razón quedaron transacciones de Fintoc en otras cuentas de Bravium, borrarlas por origin
    const remainingFintocTxs = await prisma.bankTransaction.deleteMany({
        where: {
            bankAccount: { organizationId: bravium.id },
            origin: 'API_INTEGRATION' // Origen de Fintoc
        }
    });
    if (remainingFintocTxs.count > 0) {
        console.log(`Borradas ${remainingFintocTxs.count} transacciones Fintoc adicionales (origin API).`);
    }

    // 2. Limpiar las credenciales de Fintoc en el perfil de la Organización
    await prisma.organization.update({
        where: { id: bravium.id },
        data: {
            fintocApiKey: null,
            fintocPublicKey: null,
            fintocLinkToken: null
        }
    });

    console.log("Credenciales Fintoc de Bravium removidas.");
    console.log(`✅ ¡Limpieza completada! Se borró todo rastro de Fintoc y DP Sistemas en Bravium. Total movimientos eliminados: ${totalDeleted + remainingFintocTxs.count}.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
