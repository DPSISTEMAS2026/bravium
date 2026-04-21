import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const bravium = await prisma.organization.findFirst({
    where: { name: { contains: 'Bravium' } }
  });

  if (!bravium) {
    console.error('No se encontró la organización Bravium.');
    return;
  }

  const payload = {
    fromDate: '2026-01-01',
    toDate: '2026-12-31',
    organizationId: bravium.id
  };

  console.log('Enviando petición a motor de conciliación:', payload);

  try {
    const res = await fetch('http://localhost:3000/api/conciliacion/run-auto-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log('Respuesta:', res.status, data);

    if (!res.ok) {
        console.log("Asegúrate de que el servidor Nest/Next esté corriendo.");
    }
  } catch (error) {
    console.error('Error (el servidor está detenido?):', error.message);
  }
}

main().finally(() => prisma.$disconnect());
