import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function cleanRut(rut: string) {
    return rut.replace(/\./g, '').split('-')[0].toUpperCase();
}

async function main() {
    const providers = await prisma.provider.findMany();
    const rutToName = new Map<string, string>();
    for (const p of providers) {
        if (p.rut) {
            rutToName.set(cleanRut(p.rut), p.name);
        }
    }

    const txs = await prisma.bankTransaction.findMany({
        where: { date: { gte: new Date('2026-01-01') } }
    });

    let updatedCount = 0;

    for (const tx of txs) {
        let providerNameFound: string | null = null;
        
        // Strategy 1: Match by RUT in description
        const rutRegex = /(\d{1,2}[\.]?\d{3}[\.]?\d{3}-[\dkK])/g;
        const matches = [...tx.description.matchAll(rutRegex)];
        if (matches.length > 0) {
            const extRut = cleanRut(matches[0][0]);
            if (rutToName.has(extRut)) {
                providerNameFound = rutToName.get(extRut)!;
            }
        }
        
        // Strategy 2: Match by Provider Name exactly in description
        if (!providerNameFound) {
            for (const p of providers) {
                if (p.name && tx.description.toUpperCase().includes(p.name.toUpperCase())) {
                    providerNameFound = p.name;
                    break;
                }
            }
        }
        
        if (providerNameFound) {
            const currentMetadata = (tx.metadata as any) || {};
            // Only update if it's missing or different
            if (currentMetadata.providerName !== providerNameFound) {
                const newMetadata = { ...currentMetadata, providerName: providerNameFound };
                await prisma.bankTransaction.update({
                    where: { id: tx.id },
                    data: { metadata: newMetadata }
                });
                updatedCount++;
            }
        }
    }
    
    console.log(`\n✅ Metadata actualizada para ${updatedCount} transacciones bancarias.`);
    console.log(`El pill de proveedor ('alias') aparecerá bajo la descripción en la UI respetando la glosa de Fintoc.`);
}

main().finally(() => prisma.$disconnect());
