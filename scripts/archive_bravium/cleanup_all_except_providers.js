/**
 * Limpieza total: borra transacciones, matches y sugerencias; resetea todos los DTEs a UNPAID.
 * Mantiene proveedores (y sus RUTs). Opcional: borrar también cuentas bancarias.
 *
 * Uso:
 *   node scripts/cleanup_all_except_providers.js
 *   node scripts/cleanup_all_except_providers.js --accounts   # también borra cuentas bancarias
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const deleteAccounts = process.argv.includes('--accounts');

    console.log('\n⚠️  Limpieza total (se mantienen proveedores y DTEs).');
    console.log('   Se descartan todos los matches y los DTEs vuelven a UNPAID.');
    if (deleteAccounts) console.log('   También se borrarán las cuentas bancarias.\n');

    const [delMatches, delSuggestions] = await Promise.all([
        prisma.reconciliationMatch.deleteMany({}),
        prisma.matchSuggestion.deleteMany({}),
    ]);
    await prisma.paymentRecord.updateMany({
        where: { transactionId: { not: null } },
        data: { transactionId: null },
    });
    const delTx = await prisma.bankTransaction.deleteMany({});
    let delAccounts = 0;
    if (deleteAccounts) {
        delAccounts = (await prisma.bankAccount.deleteMany({})).count;
    }
    const resetDtes = await prisma.$executeRaw`
        UPDATE dtes SET "paymentStatus" = 'UNPAID', "outstandingAmount" = "totalAmount"
    `;

    console.log('✅ Resultado:');
    console.log(`   Transacciones eliminadas: ${delTx.count}`);
    console.log(`   Matches eliminados: ${delMatches.count}`);
    console.log(`   Sugerencias eliminadas: ${delSuggestions.count}`);
    console.log(`   DTEs reseteados a UNPAID: ${resetDtes}`);
    if (deleteAccounts) console.log(`   Cuentas bancarias eliminadas: ${delAccounts}`);
    console.log('\n   Proveedores y RUTs se mantienen. Sube las cartolas nuevas y concilia movimiento por movimiento.\n');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
