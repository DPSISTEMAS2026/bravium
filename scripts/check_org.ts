import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.organization.findMany();
  console.log("Organizaciones encontradas:", orgs.map(o => ({ id: o.id, name: o.name, isActive: o.isActive, hasFintocKey: !!o.fintocApiKey })));
}

main().finally(() => prisma.$disconnect());
