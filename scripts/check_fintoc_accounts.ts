import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst({
    where: { name: { contains: 'Bravium' } }
  });

  if (!org?.fintocApiKey) {
    console.log("No API key available.");
    return;
  }

  const linkTokens = (org.fintocLinkToken || '').split(',').map(t => t.trim()).filter(Boolean);
  
  if (linkTokens.length === 0) {
    console.log("No links found.");
    return;
  }

  console.log(`Checking ${linkTokens.length} links for available accounts...`);

  for (const token of linkTokens) {
    const res = await fetch(`https://api.fintoc.com/v1/accounts?link_token=${token}`, {
      headers: { 'Authorization': org.fintocApiKey }
    });
    
    if (res.ok) {
      const data = await res.json();
      const accounts = Array.isArray(data) ? data : (data.results || [data]);
      console.log(`\nLink ${token.slice(0, 15)}... returning:`);
      for (const a of accounts) {
        console.log(`- ${a.id}: ${a.name} (${a.currency}) - Type: ${a.type} - Number: ${a.number}`);
      }
    } else {
      console.log(`Link ${token.slice(0, 15)}... returned error: ${res.status}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
