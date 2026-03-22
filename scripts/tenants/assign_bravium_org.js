/**
 * Script: Assign all existing data to Bravium organization
 * Creates the Organization record and updates all orphan rows.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Upsert Bravium organization
  const org = await prisma.organization.upsert({
    where: { rut: '77154188' },
    update: {
      slug: 'bravium',
      name: 'Bravium SpA',
      libreDteApiKey: 'WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==',
      libreDteRut: '77154188',
      googleDriveFolderId: '1TA-_Ll12LdPwY0hnuD_nRM9ZyvuVIdxH',
    },
    create: {
      rut: '77154188',
      name: 'Bravium SpA',
      slug: 'bravium',
      plan: 'PRO',
      libreDteApiKey: 'WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==',
      libreDteRut: '77154188',
      googleDriveFolderId: '1TA-_Ll12LdPwY0hnuD_nRM9ZyvuVIdxH',
    },
  });

  console.log(`✅ Organization created/updated: ${org.name} (${org.id})`);

  // 2. Update all tables with NULL organizationId
  const tables = [
    'bankAccount',
    'provider',
    'product',
    'supplierProduct',
    'productPriceHistory',
    'externalOffer',
    'purchaseRecommendation',
    'productAlias',
    'costAlert',
    'financialLedgerEntry',
    'auditLog',
    'user',
  ];

  for (const table of tables) {
    try {
      const result = await prisma[table].updateMany({
        where: { organizationId: null },
        data: { organizationId: org.id },
      });
      console.log(`  📌 ${table}: ${result.count} rows assigned`);
    } catch (e) {
      console.log(`  ⚠️  ${table}: skipped (${e.message.substring(0, 60)})`);
    }
  }

  console.log('\n🎉 All existing data assigned to Bravium organization.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
