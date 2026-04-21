import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function cleanRut(rut: string) {
    return rut.replace(/\./g, '').split('-')[0].toUpperCase();
}

async function main() {
    // 1. Map provider names to know what we inserted
    const providers = await prisma.provider.findMany();
    const rutToName = new Map<string, string>();
    for (const p of providers) {
        if (p.rut) {
            rutToName.set(cleanRut(p.rut), p.name);
        }
    }

    const txs = await prisma.bankTransaction.findMany();
    let count = 0;

    for (const tx of txs) {
        let newDesc = tx.description;
        let changed = false;

        // --- STAGE 1: Revert the format `${name} (${extRut})` back to `${extRut}`
        const rutRegex = /(\d{1,2}[\.]?\d{3}[\.]?\d{3}-[\dkK])/g;
        const matches = [...tx.description.matchAll(rutRegex)];
        
        for (const match of matches) {
            const extRut = match[0];
            const name = rutToName.get(cleanRut(extRut));
            if (name) {
                const injectedStr = `${name} (${extRut})`;
                if (newDesc.includes(injectedStr)) {
                    newDesc = newDesc.replace(injectedStr, extRut);
                    changed = true;
                }
            }
        }

        // --- STAGE 2: Revert the mangled strings from the bad reverse script
        if (newDesc.match(/Transf\.Internet(\d{1,2}[\.]?\d{3})/)) {
            newDesc = newDesc.replace(/Transf\.Internet(\d)/g, 'Transf.Internet a $1');
            changed = true;
        }

        if (newDesc.match(/Transf\.Internet a MORPH2O(\d)/)) {
            newDesc = newDesc.replace(/Transf\.Internet a MORPH2O(\d)/g, 'Transf.Internet a $1');
            changed = true;
        }
        
        if (newDesc.match(/GOPOINTS(\d)/)) {
            // Did GOPOINTS have a space? Like "GOPOINTS 76..."
            newDesc = newDesc.replace(/GOPOINTS(\d)/g, 'GOPOINTS $1');
            changed = true;
        }

        if (changed) {
            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: { description: newDesc }
            });
            count++;
            console.log(`Repaired: ${tx.description} -> ${newDesc}`);
        }
    }
    console.log(`\nFixed ${count} descriptions successfully!`);
}

main().finally(() => prisma.$disconnect());
