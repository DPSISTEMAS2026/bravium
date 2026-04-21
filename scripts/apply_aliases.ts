import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function cleanRut(rut: string) {
    return rut.replace(/\./g, '').split('-')[0].toUpperCase();
}

async function main() {
    console.log('--- APLICANDO ALIAS A MOVIMIENTOS BANCARIOS ---');
    
    // 1. Cargar proveedores
    const providers = await prisma.provider.findMany();
    const rutToName = new Map<string, string>();
    for (const p of providers) {
        if (p.rut) {
            rutToName.set(cleanRut(p.rut), p.name);
        }
    }
    console.log(`Cargados ${rutToName.size} proveedores para chequeo de alias.`);

    // 2. Cargar transacciones
    const txs = await prisma.bankTransaction.findMany();
    let updatedCount = 0;

    const rutRegex = /(\d{1,2}[\.]?\d{3}[\.]?\d{3}-[\dkK])/g;

    for (const tx of txs) {
        let changed = false;
        let newDesc = tx.description;

        const matches = [...newDesc.matchAll(rutRegex)];
        for (const match of matches) {
            const extRut = match[0];
            const name = rutToName.get(cleanRut(extRut));
            if (name && !newDesc.includes(name)) {
                // Reemplazamos el RUT por el Nombre (Alias) o lo agregamos
                newDesc = newDesc.replace(extRut, `${name} (${extRut})`);
                changed = true;
            }
        }

        if (changed) {
            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: { description: newDesc }
            });
            updatedCount++;
            console.log(`Aplicado alias: ${tx.description} -> ${newDesc}`);
        }
    }

    console.log(`Total movimientos re-etiquetados: ${updatedCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
