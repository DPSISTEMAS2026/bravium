import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const dpOrgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d'; // DP Sistemas
    const braviumOrgId = '715545b8-4522-4bb1-be81-3047546c0e8c'; // Bravium

    console.log("Cruces Analíticos: Fintoc (DP) vs Cartola Manual (Bravium)\n");

    // 1. Obtener todas las transacciones de Fintoc (DP Sistemas)
    const fintocTxs = await prisma.bankTransaction.findMany({
        where: {
            origin: 'API_INTEGRATION',
            bankAccount: { organizationId: dpOrgId, bankName: { contains: 'Fintoc' } }
        },
        orderBy: { date: 'asc' }
    });

    // 2. Obtener cartolas manuales de Bravium (Cuenta CC Santander)
    const braviumTxs = await prisma.bankTransaction.findMany({
        where: {
            bankAccountId: 'acc-santander-9219882-0'
        },
        orderBy: { date: 'asc' }
    });

    console.log(`📊 Universo Fintoc (Realidad Banco): ${fintocTxs.length} movimientos`);
    console.log(`📊 Universo Bravium (Cartola Manual): ${braviumTxs.length} movimientos\n`);

    let exactMatches = 0;
    let missingInBravium = 0;
    let notInFintoc = 0;

    // Buscar qué cosas de Fintoc ya estaban en Bravium
    const braviumSet = new Set(braviumTxs.map(t => `${t.date.toISOString().split('T')[0]}_${t.amount}`));
    const fintocUnmatched = [];

    fintocTxs.forEach(fTx => {
        const keyOptions = [
            `${fTx.date.toISOString().split('T')[0]}_${fTx.amount}`,
            // a veces la cartola difiere 1 día
            `${new Date(new Date(fTx.date).setDate(fTx.date.getDate() - 1)).toISOString().split('T')[0]}_${fTx.amount}`,
            `${new Date(new Date(fTx.date).setDate(fTx.date.getDate() + 1)).toISOString().split('T')[0]}_${fTx.amount}`
        ];

        let matched = false;
        for (const k of keyOptions) {
            if (braviumSet.has(k)) {
                exactMatches++;
                braviumSet.delete(k); // lo quitamos para no hacer doble match
                matched = true;
                break;
            }
        }

        if (!matched) {
            fintocUnmatched.push(fTx);
            missingInBravium++;
        }
    });

    // Lo que sobró en Bravium (no estaba en Fintoc)
    notInFintoc = braviumSet.size;

    console.log(`✅ Movimientos Cuadrados / Perfectos: ${exactMatches}`);
    console.log(`⚠️ Movimientos de Fintoc no ingresados en Bravium: ${missingInBravium}`);
    console.log(`👻 Movimientos en Bravium que NO existen en Fintoc reportado: ${notInFintoc}\n`);

    console.log(`--- Top 5 Faltantes (Están en Fintoc y te faltan en Bravium) ---`);
    fintocUnmatched.slice(0, 5).forEach(t => {
        console.log(`[FINTOC] ${t.date.toISOString().split('T')[0]} | $${t.amount} | ${t.description}`);
    });
}

main().finally(() => prisma.$disconnect());
