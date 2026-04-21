import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- REVIRTIENDO MUTACION DE DESCRIPCIONES ---');
    const txs = await prisma.bankTransaction.findMany({
        where: { description: { contains: '(' } }
    });

    let updatedCount = 0;
    const regex = /(.*?)(?:[^\d]+)\((\d{1,2}[\.]?\d{3}[\.]?\d{3}-[\dkK])\)/;

    for (const tx of txs) {
        // e.g. "Transf.Internet a PATAGONIK S A (99.535.370-9)"
        // "Transf.Internet a SOCIEDAD TURISTICA SOUTH AND DESERT LIMITADA (76.594.462-7)"
        
        // We know we replaced `extRut` with `${name} (${extRut})`.
        // Let's find exactly the pattern:  " " + COMPANY NAME + " (" + RUT + ")"
        // The original string was:    text_before + RUT + text_after
        // The new string is:          text_before + " " + NAME + " (" + RUT + ")" + text_after (wait, I replaced the rut with `${name} (${extRut})`)
        // Actually, my script was: newDesc = newDesc.replace(extRut, `${name} (${extRut})`);
        // So original: "Transf.Internet a 99.535.370-9"
        // Mutated: "Transf.Internet a PATAGONIK S A (99.535.370-9)"
        
        // A safer way: regex to find ` NAME (RUT)` and replace it with `RUT`.
        let newDesc = tx.description;
        const matches = [...newDesc.matchAll(/ ([^()0-9]+) \((\d{1,2}[\.]?\d{3}[\.]?\d{3}-[\dkK])\)/g)];
        
        let changed = false;
        for (const match of matches) {
            const entireMatch = match[0]; // e.g. " PATAGONIK S A (99.535.370-9)"
            const rutOnly = match[2];     // e.g. "99.535.370-9"
            newDesc = newDesc.replace(entireMatch, rutOnly);
            changed = true;
        }

        // What if my regex above doesn't cover all cases due to numbers in company name?
        // Let's do a more robust one if needed.
        if (!changed) {
            // Check if it matches exactly the pattern we used
            const alteredMatch = newDesc.match(/(.+) (.*?) \((\d{1,2}[\.]?\d{3}[\.]?\d{3}-[\dkK])\)/);
            if (alteredMatch) {
                // If it starts with Transf.Internet a ...
                // Honestly, another way is just fetch original from fintoc? No, metadata doesn't hold description.
                // Let's use string manipulation based on what we injected.
                // We injected: `${name} (${extRut})`.
            }
        }

        if (changed) {
            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: { description: newDesc }
            });
            updatedCount++;
        }
    }
    console.log(`Revertidas ${updatedCount} transacciones.`);
}

main().finally(() => prisma.$disconnect());
