import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const orgRut = "77.100.200-K"; // Un RUT temporal, no proporcionado en la solicitud
  const orgName = "DP Sistemas y Automatizaciones SpA";

  // Buscar si la organización ya existe (por slug)
  let org = await prisma.organization.findUnique({
    where: { slug: 'dp-sistemas' }
  });

  if (!org) {
     // Check rut conflict
    let orgByRut = await prisma.organization.findUnique({ where: { rut: orgRut } });
    if(orgByRut){
        org = orgByRut;
        console.log(`Organización encontrada por RUT: ${org.id}`);
    } else {
      org = await prisma.organization.create({
        data: {
          rut: orgRut,
          name: orgName,
          slug: 'dp-sistemas',
          plan: 'PRO',
          isActive: true,
        }
      });
      console.log(`Organización creada con éxito: ${org.id} (${org.name})`);
    }
  } else {
    console.log(`La organización ya existe: ${org.id} (${org.name})`);
  }

  // Create user
  const userEmail = "contacto@dpsistemas.cl";
  const plainPassword = "Contrasena2026!"; // Contraseña por defecto
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  let user = await prisma.user.findUnique({
    where: { email: userEmail }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash,
        fullName: "DP Sistemas",
        role: "ADMIN",
        organizationId: org.id
      }
    });
    console.log(`Usuario creado con éxito: ${user.email} con contraseña: ${plainPassword}`);
  } else {
    // Si ya existe, nos aseguramos que esté asignado a esta organización y sea ADMIN
    user = await prisma.user.update({
      where: { email: userEmail },
      data: {
        organizationId: org.id,
        role: "ADMIN"
      }
    });
    console.log(`El usuario ya existía: ${user.email}. Se le asignó la organización de DP Sistemas y el rol ADMIN.`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
