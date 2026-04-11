import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Buscando usuario b7684058-7875-427a-b6a3-00fd8e15cff7 ---');
  const specificUser = await prisma.user.findUnique({
    where: { id: 'b7684058-7875-427a-b6a3-00fd8e15cff7' },
    select: { id: true, email: true, fullName: true, role: true }
  });
  console.log(JSON.stringify(specificUser, null, 2));

  console.log('\n--- Buscando todos los usuarios llamados "Daniela" ---');
  const danielaUsers = await prisma.user.findMany({
    where: {
      fullName: { contains: 'Daniela', mode: 'insensitive' }
    },
    select: { id: true, email: true, fullName: true, role: true }
  });
  console.log(JSON.stringify(danielaUsers, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
