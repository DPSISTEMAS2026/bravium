import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const orgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d'; // DP Sistemas

    const counts = await prisma.bankTransaction.groupBy({
        by: ['bankAccountId'],
        where: {
            bankAccount: { organizationId: orgId, bankName: { contains: 'Fintoc' } },
            origin: 'API_INTEGRATION'
        },
        _count: { id: true }
    });

    const accounts = await prisma.bankAccount.findMany({
        where: { id: { in: counts.map(c => c.bankAccountId) } }
    });

    console.log("Resumen de Movimientos Descargados desde Fintoc para DP Sistemas:");
    for (const c of counts) {
        const acc = accounts.find(a => a.id === c.bankAccountId);
        console.log(`- Cuenta ${acc?.bankName} (Nº ${acc?.accountNumber}): ${c._count.id} transacciones`);
    }
}

main().finally(() => prisma.$disconnect());
