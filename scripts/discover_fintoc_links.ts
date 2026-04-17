import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const orgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d'; // DP Sistemas
  const org = await prisma.organization.findUnique({ where: { id: orgId } });

  if (!org || !org.fintocApiKey) {
    console.log('Org not found or no API key');
    return;
  }

  console.log(`Checking links for ${org.name}...`);
  
  try {
    const response = await fetch('https://api.fintoc.com/v1/links', {
      headers: { 'Authorization': org.fintocApiKey }
    });

    if (response.ok) {
      const links = await response.json() as any[];
      console.log(`Found ${links.length} links:`);
      links.forEach(l => {
        console.log(`- ID: ${l.id}, Bank: ${l.institution.name}, Username: ${l.username}, Created: ${l.created_at}`);
        console.log(`  Token: ${l.link_token}`);
      });
    } else {
      console.log('Error fetching links:', response.status, await response.text());
    }
  } catch (error) {
    console.error('Fetch Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
