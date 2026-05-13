import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const ORG = '715545b8-4522-4bb1-be81-3047546c0e8c';

async function main() {
    const drafts = await p.reconciliationMatch.findMany({
        where: {
            status: 'DRAFT',
            organizationId: ORG,
            transaction: { date: { gte: new Date('2026-01-01') } }
        },
        include: { transaction: { select: { amount: true, description: true, date: true } } }
    });
    
    const total = drafts.reduce((s, m) => s + Math.abs(m.transaction?.amount || 0), 0);
    const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);
    
    console.log(`DRAFT matches: ${drafts.length}`);
    console.log(`Monto REAL total: ${fmt(total)}`);
    console.log(`\nTop 10 por monto (preview - lo que mostraba antes):`);
    const first10 = drafts.slice(0, 10);
    const previewTotal = first10.reduce((s, m) => s + Math.abs(m.transaction?.amount || 0), 0);
    console.log(`Monto de solo los primeros 10: ${fmt(previewTotal)} ← esto es lo que mostraba el dashboard`);
}
main().catch(console.error).finally(() => p.$disconnect());
