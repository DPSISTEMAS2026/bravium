import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const paidDtes = await prisma.dTE.findMany({
    where: { paymentStatus: { not: 'UNPAID' } },
    select: { folio: true, issuedDate: true, paymentStatus: true, providerId: true }
  });

  console.log(`DTEs NO UNPAID en la base de datos: ${paidDtes.length}`);
  
  if (paidDtes.length > 0) {
    const years = {};
    paidDtes.forEach(dte => {
      const year = dte.issuedDate.getFullYear();
      years[year] = (years[year] || 0) + 1;
    });
    console.log('Distribución por año de emisión:', years);
    
    console.log('\nEjemplos (hasta 5):');
    paidDtes.slice(0, 5).forEach(dte => {
      console.log(`- Folio: ${dte.folio} | Fecha: ${dte.issuedDate.toISOString().slice(0,10)} | Estado: ${dte.paymentStatus}`);
    });
  }

  // Verificar si hay Payment records
  const paymentsCount = await prisma.payment.count();
  console.log(`\nPagos (Payment) registrados independientemente (manuales, transferencias, etc): ${paymentsCount}`);
}

main().finally(() => prisma.$disconnect());
