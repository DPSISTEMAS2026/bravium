import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const newRut = "78.341.404-K";

  const org = await prisma.organization.update({
    where: { slug: 'dp-sistemas' },
    data: { rut: newRut }
  });

  console.log(`Organización actualizada: ${org.name} con nuevo RUT: ${org.rut}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
