import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  console.log(`Fecha/hora actual: ${now.toISOString()}\n`);

  // Check audit logs for Carlos and Daniela login activity
  const carlosUser = await prisma.user.findFirst({ where: { fullName: { contains: 'Carlos', mode: 'insensitive' } } });
  const danielaUser = await prisma.user.findFirst({ where: { fullName: { contains: 'Daniela', mode: 'insensitive' } } });

  console.log('=== Carlos ===');
  console.log(`ID: ${carlosUser?.id}, Name: ${carlosUser?.fullName}, Email: ${carlosUser?.email}`);
  console.log(`updatedAt: ${carlosUser?.updatedAt}`);

  console.log('\n=== Daniela ===');
  console.log(`ID: ${danielaUser?.id}, Name: ${danielaUser?.fullName}, Email: ${danielaUser?.email}`);
  console.log(`updatedAt: ${danielaUser?.updatedAt}`);

  // Check latest audit logs for each user
  if (carlosUser) {
    const carlosLogs = await prisma.auditLog.findMany({
      where: { userId: carlosUser.id },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log(`\n=== Carlos Audit Logs (last 5) ===`);
    if (carlosLogs.length === 0) console.log('  No audit logs found');
    for (const log of carlosLogs) {
      console.log(`  [${log.createdAt.toISOString()}] ${log.action} - ${log.entityType}:${log.entityId}`);
    }
  }

  if (danielaUser) {
    const danielaLogs = await prisma.auditLog.findMany({
      where: { userId: danielaUser.id },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log(`\n=== Daniela Audit Logs (last 5) ===`);
    if (danielaLogs.length === 0) console.log('  No audit logs found');
    for (const log of danielaLogs) {
      console.log(`  [${log.createdAt.toISOString()}] ${log.action} - ${log.entityType}:${log.entityId}`);
    }
  }

  // Also check all audit logs to see the latest activity of any kind  
  const latestLogs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { userId: true, action: true, createdAt: true, entityType: true }
  });
  console.log(`\n=== Latest 10 Audit Logs (all users) ===`);
  for (const log of latestLogs) {
    console.log(`  [${log.createdAt.toISOString()}] user:${log.userId} ${log.action} ${log.entityType}`);
  }

  // Check Fintoc API link details to see if there's per-user/profile info
  const org = await prisma.organization.findFirst({ where: { slug: 'bravium' } });
  if (org?.fintocApiKey) {
    console.log('\n=== FINTOC LINK DETAILS ===');
    const resp = await fetch('https://api.fintoc.com/v1/links', {
      headers: { Authorization: org.fintocApiKey }
    });
    const links: any[] = await resp.json();
    for (const link of links) {
      console.log(`\n--- Link: ${link.id} (${link.institution?.name}) ---`);
      console.log(JSON.stringify(link, null, 2));
    }
  }

  await prisma.$disconnect();
}

main();
