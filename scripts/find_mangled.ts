import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const txs = await prisma.bankTransaction.findMany();
    const rutRegexAtEndOrMangled = /[a-zA-Z](\d{1,2}[\.]?\d{3}[\.]?\d{3}-[\dkK])/;
    const mangled = new Set<string>();

    for (const tx of txs) {
        const m = tx.description.match(rutRegexAtEndOrMangled);
        if (m) {
            mangled.add(tx.description.substring(0, m.index! + 1)); // get the prefix word ending in that char
        }
    }
    console.log("Mangled prefixes: ", Array.from(mangled));
}
main().finally(() => prisma.$disconnect());
