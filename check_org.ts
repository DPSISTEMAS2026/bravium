import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findUnique({
    where: { id: '715545b8-4522-4bb1-be81-3047546c0e8c' }
  });
  console.log(JSON.stringify(org, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
