import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Leer credenciales de DP Sistemas
  const dpSistemas = await prisma.organization.findFirst({
    where: { name: { contains: 'DP Sistemas' } },
    select: { id: true, name: true, fintocApiKey: true, fintocPublicKey: true, fintocLinkToken: true }
  });

  console.log('DP Sistemas:', dpSistemas);

  if (!dpSistemas?.fintocApiKey) {
    console.log('No hay credenciales Fintoc en DP Sistemas.');
    return;
  }

  // Mover a Bravium
  const bravium = await prisma.organization.findFirst({
    where: { name: { contains: 'Bravium' } }
  });

  if (!bravium) {
    console.log('No se encontró la org Bravium.');
    return;
  }

  console.log(`\nMoviendo credenciales de "${dpSistemas.name}" -> "${bravium.name}"...`);

  await prisma.organization.update({
    where: { id: bravium.id },
    data: {
      fintocApiKey: dpSistemas.fintocApiKey,
      fintocPublicKey: dpSistemas.fintocPublicKey,
      fintocLinkToken: dpSistemas.fintocLinkToken,
    }
  });

  // Limpiar de DP Sistemas
  await prisma.organization.update({
    where: { id: dpSistemas.id },
    data: {
      fintocApiKey: null,
      fintocPublicKey: null,
      fintocLinkToken: null,
    }
  });

  // Verificar
  const updated = await prisma.organization.findFirst({
    where: { name: { contains: 'Bravium' } },
    select: { name: true, fintocApiKey: true, fintocPublicKey: true, fintocLinkToken: true }
  });
  console.log('\nBravium actualizado:', updated);
  console.log('✅ Credenciales movidas exitosamente.');
}

main().finally(() => prisma.$disconnect());
