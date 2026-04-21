const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const total = await p.dte.count({where: { provider: { name: { contains: 'CENCOSUD' } } }});
  const y2026 = await p.dte.count({where: { provider: { name: { contains: 'CENCOSUD' } }, issuedDate: { gte: new Date('2026-01-01T00:00:00Z'), lte: new Date('2026-12-31T23:59:59Z') } }});
  console.log('Total:', total, '2026:', y2026);
}
main().finally(() => process.exit(0));
