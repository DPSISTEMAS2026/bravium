import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
    const prov = await p.provider.findFirst({ where: { name: { contains: 'Rafael', mode: 'insensitive' } } });
    if (!prov) { console.log('Proveedor no encontrado'); return; }
    console.log('Proveedor:', prov.name, '| RUT:', prov.rut, '| ID:', prov.id);

    // Sus DTEs
    const dtes = await p.dTE.findMany({
        where: { providerId: prov.id },
        orderBy: { issuedDate: 'desc' },
        select: { id: true, folio: true, type: true, totalAmount: true, paymentStatus: true, issuedDate: true, rutIssuer: true }
    });
    console.log('\nDTEs:');
    for (const d of dtes) {
        console.log(`  Tipo ${d.type} | F${d.folio} | $${Math.abs(d.totalAmount).toLocaleString('es-CL')} | ${d.paymentStatus} | ${d.issuedDate.toISOString().slice(0,10)} | rutIssuer: ${d.rutIssuer}`);
    }

    // TXs por descripcion que contengan el RUT real (16.751.160-0 basado en el DRAFT que vimos antes)
    const txsByDesc = await p.bankTransaction.findMany({
        where: { description: { contains: '16751160', mode: 'insensitive' } },
        orderBy: { date: 'desc' },
        select: { id: true, date: true, amount: true, description: true, status: true, metadata: true }
    });
    console.log('\nTXs con RUT 16.751.160 en descripcion:');
    for (const t of txsByDesc) {
        const meta = t.metadata as any;
        console.log(`  $${Math.abs(t.amount).toLocaleString('es-CL')} | ${t.status} | ${t.date.toISOString().slice(0,10)} | ${t.description?.slice(0,70)}`);
        console.log(`    providerRut: ${meta?.providerRut}`);
    }

    // Matches de Rafael
    const matches = await p.reconciliationMatch.findMany({
        where: { dte: { providerId: prov.id } },
        include: { 
            dte: { select: { folio: true, type: true, totalAmount: true } },
            bankTransaction: { select: { amount: true, description: true, date: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
    console.log('\nMatches de Rafael:');
    for (const m of matches) {
        console.log(`  [${m.status}] TX $${Math.abs(m.bankTransaction?.amount || 0).toLocaleString('es-CL')} → DTE F${m.dte?.folio} Tipo ${m.dte?.type} $${Math.abs(m.dte?.totalAmount || 0).toLocaleString('es-CL')}`);
        console.log(`    Regla: ${m.ruleApplied?.slice(0, 80)}`);
    }

    // AutoCategoryRules de Rafael
    const rules = await p.autoCategoryRule.findMany({ where: { providerId: prov.id } });
    console.log('\nAutoCategoryRules:');
    for (const r of rules) console.log(`  "${r.keywordMatch}" | isActive: ${r.isActive}`);

    // ProviderAliases de Rafael
    const aliases = await p.providerAlias.findMany({ where: { providerId: prov.id } });
    console.log('\nProviderAliases:');
    for (const a of aliases) console.log(`  "${a.description}"`);
}
main().catch(console.error).finally(() => p.$disconnect());
