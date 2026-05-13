const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const prov = await p.provider.findFirst({where: { name: { contains: 'EFICIENCIA LABORES' } }});
  console.log(prov);
}
main().finally(() => process.exit(0));
