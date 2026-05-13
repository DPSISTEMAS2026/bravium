import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
    // ¿Qué AutoCategoryRule está tagueando transacciones como "Compra Falabella"?
    const rules = await p.autoCategoryRule.findMany({
        where: { 
            OR: [
                { category: { contains: 'falabella', mode: 'insensitive' } },
                { label: { contains: 'falabella', mode: 'insensitive' } },
                { keywordMatch: { contains: 'falabella', mode: 'insensitive' } },
            ]
        },
        include: { provider: { select: { name: true, rut: true } } }
    });
    console.log('AutoCategoryRules con "falabella":');
    for (const r of rules) {
        console.log(`  keyword: "${r.keywordMatch}" | category: "${r.category}" | label: "${r.label}" | provider: ${r.provider?.name}`);
    }

    // ¿Qué regla está matcheando "0160314249 Transf a AVILA RAMIREZ"?
    const txDesc = '0160314249 Transf a AVILA RAMIREZ';
    const allRules = await p.autoCategoryRule.findMany({ 
        where: { isActive: true },
        select: { keywordMatch: true, category: true, label: true }
    });
    console.log(`\nReglas que matchean "${txDesc}":`);
    for (const r of allRules) {
        if (txDesc.toLowerCase().includes(r.keywordMatch.toLowerCase())) {
            console.log(`  keyword: "${r.keywordMatch}" → category: "${r.category}" label: "${r.label}"`);
        }
    }

    // ¿Tiene metadata la TX de Avila?
    const tx = await p.bankTransaction.findFirst({
        where: { description: { contains: '0160314249', mode: 'insensitive' } },
        orderBy: { date: 'desc' },
        select: { id: true, description: true, amount: true, date: true, metadata: true, status: true }
    });
    if (tx) {
        console.log(`\nTX Avila Ramirez más reciente:`);
        console.log(`  desc: ${tx.description}`);
        console.log(`  amount: $${Math.abs(tx.amount).toLocaleString('es-CL')} | status: ${tx.status}`);
        console.log(`  metadata:`, JSON.stringify(tx.metadata, null, 2));
    }

    // ¿Cuántas TXs de Avila existen y sus matchs actuales?
    const avilaTxs = await p.bankTransaction.findMany({
        where: { description: { contains: '0160314249', mode: 'insensitive' } },
        select: { id: true, description: true, amount: true, date: true, status: true, metadata: true },
        orderBy: { date: 'desc' },
        take: 10
    });
    console.log(`\nTodas las TXs de Avila (${avilaTxs.length}):`);
    for (const t of avilaTxs) {
        const meta = t.metadata as any;
        console.log(`  $${Math.abs(t.amount).toLocaleString('es-CL')} | ${t.status} | ${t.date.toISOString().slice(0,10)} | category: ${meta?.category} | label: ${meta?.label}`);
    }
}
main().catch(console.error).finally(() => p.$disconnect());
