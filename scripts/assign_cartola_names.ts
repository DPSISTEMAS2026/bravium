import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const targetAccountId = 'acc-santander-9219882-0';

    // Buscar todas las transacciones Fintoc migradas (sin sourceFile en metadata)
    const fintocTxs = await prisma.bankTransaction.findMany({
        where: {
            bankAccountId: targetAccountId,
            origin: 'API_INTEGRATION'
        }
    });

    console.log(`Encontradas ${fintocTxs.length} transacciones Fintoc sin cartola asignada.`);

    let updated = 0;
    for (const tx of fintocTxs) {
        const meta = (tx.metadata as any) || {};
        if (meta.sourceFile) continue; // Ya tiene

        // Generar nombre de cartola por mes: "Fintoc Santander - Enero 2026"
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const d = new Date(tx.date);
        const mesNombre = meses[d.getMonth()];
        const anio = d.getFullYear();
        const sourceFile = `Fintoc Santander CC - ${mesNombre} ${anio}`;

        await prisma.bankTransaction.update({
            where: { id: tx.id },
            data: {
                metadata: {
                    ...meta,
                    sourceFile
                }
            }
        });
        updated++;
    }

    console.log(`✅ ${updated} transacciones actualizadas con nombre de cartola.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
