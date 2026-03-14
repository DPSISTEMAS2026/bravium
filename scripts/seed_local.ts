import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando carga de datos básicos...');

  // 1. Crear Organización base
  const org = await prisma.organization.upsert({
    where: { rut: '77154188' },
    update: {},
    create: {
      rut: '77154188',
      name: 'BRAVIUM CHILE',
      plan: 'PRO',
    },
  });
  console.log('✅ Organización creada:', org.name);

  // 2. Crear Usuario Administrador
  const passwordHash = await bcrypt.hash('admin123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'admin@bravium.cl' },
    update: {},
    create: {
      email: 'admin@bravium.cl',
      fullName: 'Administrador Local',
      passwordHash: passwordHash,
      role: 'ADMIN',
      organizationId: org.id,
    },
  });
  console.log('✅ Usuario Administrador creado:', user.email);
  console.log('🔑 Credenciales: admin@bravium.cl / admin123');
}

main()
  .catch((e) => {
    console.error('❌ Error en el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
