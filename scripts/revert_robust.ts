import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const txs = await prisma.bankTransaction.findMany({
        where: { description: { contains: '(' } }
    });

    let count = 0;
    for (const tx of txs) {
        // e.g. "Transf.Internet a PATAGONIK S A (99.535.370-9)"
        // It's always appending the provider name in between "Transf.Internet a " and "(RUT)"
        // But what if it's "Pago a PATAGONIK S A (99.535.370-9)" ?
        // We know we replaced: RUT => NAME (RUT)
        // Therefore, if I find ` NAME (RUT)`, I just replace it with `RUT`.
        
        // Let's just find the last parenthesis group which contains a RUT.
        // And whatever is before it? It's too complex.
        
        // Easier: Since I have the alias mapping script logic, I can reverse it!
        // The script did: newDesc.replace(extRut, `${name} (${extRut})`)
        // To reverse: newDesc.replace(`${name} (${extRut})`, extRut)
        
        const rutRegex = /(\d{1,2}[\.]?\d{3}[\.]?\d{3}-[\dkK])/g;
        let newDesc = tx.description;
        const matches = [...tx.description.matchAll(rutRegex)];
        
        let changed = false;
        for (const match of matches) {
            const extRut = match[0];
            // Since we know the RUT, let's look for any text between a space and `(` before the RUT.
            // Simply: We want to match " ANY TEXT (" + extRut + ")"
            // Replaced by: extRut
            
            // Example: "PATAGONIK S A (99.535.370-9)"
            // Regex: / [A-Z0-9\.\-\& ]+ \((99\.535\.370\-9)\)/i
            const reverseRegex = new RegExp(` ([A-Z0-9\\.\\-\\&ÁÉÍÓÚÑü, ]+) \\(${extRut.replace(/\./g, '\\.')}\\)`, 'i');
            
            if (reverseRegex.test(newDesc)) {
                newDesc = newDesc.replace(reverseRegex, extRut);
                changed = true;
            }
        }

        if (changed) {
            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: { description: newDesc }
            });
            count++;
            console.log(`Reverted: ${tx.description} -> ${newDesc}`);
        }
    }
    console.log(`Revertidas ${count}`);
}

main().finally(() => prisma.$disconnect());
