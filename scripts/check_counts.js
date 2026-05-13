const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Simular exactamente lo que hace el buildWhere del backend con search="47.600"
  const raw = "47.600";
  const digitsOnly = raw.replace(/\D/g, '');
  console.log('raw:', raw, '→ digitsOnly:', digitsOnly);
  
  const orConditions = [
    { description: { contains: raw, mode: 'insensitive' } },
    { reference: { contains: raw, mode: 'insensitive' } },
  ];
  
  if (digitsOnly.length >= 2) {
    const amountNum = parseInt(digitsOnly, 10);
    if (!isNaN(amountNum) && amountNum > 0) {
      orConditions.push({ amount: amountNum }, { amount: -amountNum });
    }
  }

  const where = {
    date: { gte: new Date('2026-01-01') },
    OR: orConditions
  };

  console.log('Where:', JSON.stringify(where, null, 2));

  const results = await p.bankTransaction.findMany({
    where,
    select: { id: true, date: true, amount: true, description: true, status: true },
    take: 20
  });
  
  console.log(`\nResultados: ${results.length}`);
  results.forEach(t => console.log(`  ${t.date.toISOString().substring(0,10)} $${t.amount} ${t.description?.substring(0,50)} [${t.status}]`));

  // También simular con organizationId
  const orgs = await p.organization.findMany({ select: { id: true, slug: true } });
  console.log('\nOrganizaciones:', orgs.map(o => `${o.slug}(${o.id})`).join(', '));

  // Probar con bankAccount filter
  for (const org of orgs) {
    const withOrg = {
      bankAccount: { organizationId: org.id },
      date: { gte: new Date('2026-01-01') },
      OR: orConditions
    };
    const r = await p.bankTransaction.findMany({ where: withOrg, select: { id: true }, take: 20 });
    console.log(`  Con org ${org.slug}: ${r.length} resultados`);
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
