import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const folios = [10155, 1049];
  
  console.log('=== Buscando folios en la base de datos ===\n');
  
  for (const folio of folios) {
    const dtes = await prisma.dTE.findMany({
      where: { folio },
      include: {
        provider: { select: { name: true, rut: true } },
        matches: { select: { id: true, status: true, transactionId: true } },
      },
    });
    
    if (dtes.length === 0) {
      console.log(`❌ Folio ${folio}: NO ENCONTRADO en la base de datos`);
    } else {
      for (const dte of dtes) {
        console.log(`✅ Folio ${folio}: Encontrado`);
        console.log(`   ID: ${dte.id}`);
        console.log(`   Tipo: T${dte.type}`);
        console.log(`   Monto: $${dte.totalAmount.toLocaleString('es-CL')}`);
        console.log(`   Fecha: ${dte.issuedDate.toISOString().split('T')[0]}`);
        console.log(`   Emisor: ${dte.rutIssuer}`);
        console.log(`   Proveedor: ${dte.provider?.name || 'Sin proveedor'} (${dte.provider?.rut || '-'})`);
        console.log(`   Estado pago: ${dte.paymentStatus}`);
        console.log(`   SII: ${dte.siiStatus}`);
        console.log(`   Matches: ${dte.matches.length > 0 ? dte.matches.map(m => `${m.status}`).join(', ') : 'ninguno'}`);
        console.log('');
      }
    }
  }
  
  // También buscar folios cercanos por si hay un error de tipeo
  console.log('\n=== Folios cercanos (por si hay error de tipeo) ===\n');
  for (const folio of folios) {
    const nearby = await prisma.dTE.findMany({
      where: {
        folio: { gte: folio - 5, lte: folio + 5 },
      },
      select: { folio: true, type: true, totalAmount: true, issuedDate: true, rutIssuer: true },
      orderBy: { folio: 'asc' },
      take: 20,
    });
    
    if (nearby.length > 0) {
      console.log(`Folios cercanos a ${folio}:`);
      for (const d of nearby) {
        const marker = d.folio === folio ? ' <<<' : '';
        console.log(`  Folio ${d.folio} T${d.type} - $${d.totalAmount.toLocaleString('es-CL')} - ${d.issuedDate.toISOString().split('T')[0]} - ${d.rutIssuer}${marker}`);
      }
    } else {
      console.log(`No hay folios cercanos a ${folio}`);
    }
    console.log('');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
