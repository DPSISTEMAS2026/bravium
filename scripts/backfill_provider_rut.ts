/**
 * backfill_provider_rut.ts
 * -------------------------
 * Recorre transacciones existentes sin providerRut en metadata,
 * extrae el RUT chileno de la descripción bancaria y lo guarda.
 *
 * Ej: "TransfInternet a 76.794.035-1" → metadata.providerRut = "76.794.035-1"
 *
 * Ejecutar una sola vez:
 *   npx ts-node -e "require('./scripts/backfill_provider_rut.ts')"
 *   o:
 *   npx tsx scripts/backfill_provider_rut.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Regex estricta: captura RUT chileno con guión y dígito verificador
const RUT_REGEX = /(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])/i;

async function main() {
    console.log('=== BACKFILL providerRut desde descripción ===\n');

    // Solo transacciones pendientes/no conciliadas (no tocar MATCHED para no romper nada)
    const txs = await prisma.bankTransaction.findMany({
        where: {
            status: { in: ['PENDING', 'UNMATCHED', 'PARTIALLY_MATCHED'] },
            type: 'DEBIT',
        },
        select: { id: true, description: true, metadata: true },
    });

    console.log(`Analizando ${txs.length} transacciones...`);

    let enriched = 0;
    let alreadyHad = 0;
    let noRut = 0;

    for (const tx of txs) {
        const meta = (tx.metadata as Record<string, any>) || {};

        // Ya tiene providerRut → saltar
        if (meta.providerRut) {
            alreadyHad++;
            continue;
        }

        const match = (tx.description || '').match(RUT_REGEX);
        if (!match) {
            noRut++;
            continue;
        }

        const providerRut = match[1];

        await prisma.bankTransaction.update({
            where: { id: tx.id },
            data: {
                metadata: {
                    ...meta,
                    providerRut,
                },
            },
        });

        console.log(`  ✅ ${tx.description.substring(0, 60)} → ${providerRut}`);
        enriched++;
    }

    console.log('\n=== RESUMEN ===');
    console.log(`  Enriquecidas con RUT: ${enriched}`);
    console.log(`  Ya tenían providerRut: ${alreadyHad}`);
    console.log(`  Sin RUT en descripción: ${noRut}`);
    console.log('\n✔ Listo. Ahora el motor de conciliación usará RUT estricto para estas transacciones.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
