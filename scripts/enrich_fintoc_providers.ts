import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const targetAccountId = 'acc-santander-9219882-0';

    // 1. Cargar todos los proveedores de Bravium con su RUT
    const braviumOrgId = '715545b8-4522-4bb1-be81-3047546c0e8c';
    const providers = await prisma.provider.findMany({
        where: { organizationId: braviumOrgId },
        select: { id: true, name: true, rut: true }
    });

    // Construir mapa RUT (solo dígitos) -> nombre proveedor
    const rutMap = new Map<string, string>();
    for (const p of providers) {
        if (p.rut) {
            const cleanRut = p.rut.replace(/[^0-9kK]/g, '').toUpperCase();
            rutMap.set(cleanRut, p.name);
            // También sin dígito verificador
            if (cleanRut.length > 1) {
                rutMap.set(cleanRut.slice(0, -1), p.name);
            }
        }
    }

    console.log(`Cargados ${providers.length} proveedores con ${rutMap.size} variantes de RUT.`);

    // 2. Buscar transacciones Fintoc sin providerName
    const fintocTxs = await prisma.bankTransaction.findMany({
        where: {
            bankAccountId: targetAccountId,
            origin: 'API_INTEGRATION'
        }
    });

    let enriched = 0;
    let noMatch = 0;

    for (const tx of fintocTxs) {
        const meta = (tx.metadata as any) || {};
        if (meta.providerName) continue; // Ya tiene

        // Extraer RUT de la descripción (ej: "TransfInternet a 76.794.035-1")
        const desc = tx.description || '';
        const rutMatch = desc.match(/(\d{1,2}[.\s]?\d{3}[.\s]?\d{3}[-\s]?[\dkK])/i);
        
        if (!rutMatch) {
            noMatch++;
            continue;
        }

        const extractedRut = rutMatch[1].replace(/[^0-9kK]/gi, '').toUpperCase();
        
        // Buscar en nuestro mapa
        let providerName = rutMap.get(extractedRut);
        if (!providerName && extractedRut.length > 1) {
            providerName = rutMap.get(extractedRut.slice(0, -1));
        }

        if (providerName) {
            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: {
                    metadata: {
                        ...meta,
                        providerName,
                        providerRut: rutMatch[1]
                    }
                }
            });
            enriched++;
        } else {
            noMatch++;
        }
    }

    console.log(`✅ ${enriched} movimientos enriquecidos con nombre de proveedor.`);
    console.log(`⚠️ ${noMatch} movimientos sin proveedor identificable (RUT no encontrado en la base).`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
