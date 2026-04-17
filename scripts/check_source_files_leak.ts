import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const query = `
    SELECT ba."organizationId", org.name as org_name, metadata->>'sourceFile' as source_file, count(*)
    FROM bank_transactions bt
    JOIN bank_accounts ba ON ba.id = bt."bankAccountId"
    JOIN organizations org ON org.id = ba."organizationId"
    GROUP BY ba."organizationId", org.name, metadata->>'sourceFile'
    ORDER BY org.name;
  `;
  const rows = await prisma.$queryRawUnsafe<any>(query);
  console.log(JSON.stringify(rows, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
