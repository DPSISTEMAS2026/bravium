import { PrismaClient } from '@prisma/client';
import { FintocService } from '../src/modules/ingestion/services/fintoc.service';
import { PrismaService } from '../src/common/prisma/prisma.service';

async function main() {
  const prisma = new PrismaClient();
  // We need to simulate the NestJS service environment or just use the logic
  const fintocService = new FintocService(prisma as any);

  const orgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d'; // DP Sistemas
  const org = await prisma.organization.findUnique({ where: { id: orgId } });

  if (!org || !org.fintocApiKey) {
    console.log('Org not found or no API key');
    return;
  }

  console.log(`Starting Fintoc sync for ${org.name}...`);
  console.log(`API Key: ${org.fintocApiKey.substring(0, 7)}...`);
  console.log(`Link Token: ${org.fintocLinkToken}`);

  try {
    const result = await fintocService.syncTransactions(orgId, org.fintocApiKey, org.fintocLinkToken || undefined);
    console.log('Sync Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Sync Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
