import { PrismaClient } from '@prisma/client';
import { FintocService } from '../src/modules/ingestion/services/fintoc.service';

const prisma = new PrismaClient();
const fintocService = new FintocService(prisma as any);

async function main() {
    console.log("Limpiando Fintoc Antiguo de DP Sistemas...");
    const orgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d'; // DP Sistemas

    const org = await prisma.organization.findUnique({
        where: { id: orgId }
    });

    if (!org) {
        console.error("Organización DP Sistemas no encontrada.");
        return;
    }

    // 1. Encontrar y borrar transacciones antiguas
    const oldFintocAccounts = await prisma.bankAccount.findMany({
        where: {
            organizationId: orgId,
            bankName: { contains: '(Fintoc)' }
        }
    });

    let totalDeleted = 0;
    for (const acc of oldFintocAccounts) {
        const deleted = await prisma.bankTransaction.deleteMany({
            where: { bankAccountId: acc.id }
        });
        totalDeleted += deleted.count;
        await prisma.bankAccount.delete({ where: { id: acc.id }});
    }

    // Si quedó alguna suelta
    await prisma.bankTransaction.deleteMany({
        where: {
            bankAccount: { organizationId: orgId },
            origin: 'API_INTEGRATION'
        }
    });

    console.log(`✅ Borrados ${totalDeleted} movimientos antiguos de bases locales.`);

    // 2. Extraer limpiamente solo con las credenciales nuevas
    console.log(`\nIniciando sincronización limpia con las llaves proporcionadas...`);
    
    try {
        const result = await fintocService.syncTransactions(orgId, org.fintocApiKey!, org.fintocLinkToken!);
        console.log('✅ Resultado de Sincronización Fintoc:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('❌ Error en Fintoc:', error);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
