import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    const backupDir = path.join(__dirname, '..', 'backups', `pre_migration_${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(backupDir, { recursive: true });

    console.log(`📦 Creando backup en: ${backupDir}\n`);

    // 1. Backup de TODAS las transacciones de Bravium Santander CC
    const braviumCCTxs = await prisma.bankTransaction.findMany({
        where: { bankAccountId: 'acc-santander-9219882-0' }
    });
    fs.writeFileSync(path.join(backupDir, 'bravium_santander_cc_transactions.json'), JSON.stringify(braviumCCTxs, null, 2));
    console.log(`✅ Bravium Santander CC: ${braviumCCTxs.length} transacciones respaldadas`);

    // 2. Backup de TODOS los reconciliation matches vinculados a esas transacciones
    const txIds = braviumCCTxs.map(tx => tx.id);
    const matches = await prisma.reconciliationMatch.findMany({
        where: { transactionId: { in: txIds } }
    });
    fs.writeFileSync(path.join(backupDir, 'bravium_reconciliation_matches.json'), JSON.stringify(matches, null, 2));
    console.log(`✅ Matches de conciliación: ${matches.length} respaldados`);

    // 3. Backup de las transacciones Fintoc en DP Sistemas
    const dpOrgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d';
    const fintocTxs = await prisma.bankTransaction.findMany({
        where: {
            origin: 'API_INTEGRATION',
            bankAccount: { organizationId: dpOrgId, bankName: { contains: 'Fintoc' } }
        }
    });
    fs.writeFileSync(path.join(backupDir, 'dp_fintoc_transactions.json'), JSON.stringify(fintocTxs, null, 2));
    console.log(`✅ Fintoc DP Sistemas: ${fintocTxs.length} transacciones respaldadas`);

    // 4. Backup de las cuentas bancarias de ambas orgs
    const accounts = await prisma.bankAccount.findMany({
        where: {
            organizationId: { in: [dpOrgId, '715545b8-4522-4bb1-be81-3047546c0e8c'] }
        }
    });
    fs.writeFileSync(path.join(backupDir, 'bank_accounts.json'), JSON.stringify(accounts, null, 2));
    console.log(`✅ Cuentas bancarias: ${accounts.length} respaldadas`);

    console.log(`\n🔒 Backup completo guardado en:\n${backupDir}`);
    console.log(`\nPara restaurar, solo hay que leer estos JSONs y hacer upsert/create en la DB.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
