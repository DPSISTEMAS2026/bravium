/**
 * backfill_provider_aliases.ts
 * 
 * Recorre TODOS los matches CONFIRMED y extrae:
 * 1. RUT desde la descripción del banco (formato "0XXXXXXXXX" o "RR.RRR.RRR-D")
 * 2. Glosa limpia de la TX
 * 
 * Crea ProviderAlias { rut, description, providerId, source: 'RETROACTIVE' }
 * para que el motor P0/P3 capture futuras TXs al mismo RUT/glosa del mismo proveedor.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

function extractRutFromDesc(desc: string): string | null {
    if (!desc) return null;
    // Formato 0XXXXXXXXX (10 dígitos con leading zero)
    const m1 = desc.match(/\b(0\d{9})\b/);
    if (m1) return m1[1];
    // Formato RR.RRR.RRR-D
    const m2 = desc.match(/\b(\d{1,2}\.\d{3}\.\d{3}-[\dkK])\b/);
    if (m2) return m2[1].replace(/\./g, '');
    // Formato sin puntos: RRRRRRRRRD
    const m3 = desc.match(/\b(\d{7,8}[-][\dkK])\b/);
    if (m3) return m3[1].replace('-', '');
    return null;
}

async function main() {
    const org = await p.organization.findFirst({ where: { isActive: true } });
    if (!org) throw new Error('No org');

    // Todos los matches CONFIRMED con TX+DTE
    const matches = await p.reconciliationMatch.findMany({
        where: {
            status: 'CONFIRMED',
            organizationId: org.id,
            dteId: { not: null },
        },
        include: {
            transaction: { select: { description: true, amount: true } },
            dte: {
                include: {
                    provider: { select: { id: true, name: true, rut: true } }
                }
            }
        }
    });

    console.log(`\nAnalizando ${matches.length} matches CONFIRMED...\n`);

    let created = 0;
    let skipped = 0;
    let noProvider = 0;
    let noRut = 0;

    for (const match of matches) {
        const provider = match.dte?.provider;
        if (!provider) { noProvider++; continue; }

        const desc = match.transaction?.description || '';
        const rut = extractRutFromDesc(desc);

        if (!rut) { noRut++; continue; }

        // Normalizar RUT extraído (sin puntos, sin guión para comparar)
        const rutNorm = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase();
        const provRutNorm = (provider.rut || '').replace(/\./g, '').replace(/-/g, '').toUpperCase();

        // Si el RUT de la TX coincide con el RUT del proveedor → ya está mapeado, skip
        if (rutNorm === provRutNorm) { skipped++; continue; }

        // Verificar que no exista ya un alias para este RUT+proveedor
        const existing = await p.providerAlias.findFirst({
            where: { rut: rutNorm, providerId: provider.id }
        });
        if (existing) { skipped++; continue; }

        // Verificar también que no exista ya por description+providerId
        const existingByDesc = desc ? await p.providerAlias.findFirst({
            where: { description: desc.slice(0, 100), providerId: provider.id }
        }) : null;
        if (existingByDesc) { skipped++; continue; }

        // Crear alias RUT → proveedor
        try {
            await p.providerAlias.create({
                data: {
                    rut: rutNorm,
                    description: desc.slice(0, 100),
                    providerId: provider.id,
                    source: 'RETROACTIVE',
                }
            });
        } catch (e: any) {
            if (e.code === 'P2002') { skipped++; continue; }
            throw e;
        }

        console.log(`  ✅ RUT ${rutNorm} → ${provider.name} (${provider.rut})`);
        console.log(`     TX: "${desc.slice(0, 60)}"`);
        created++;
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Aliases creados:           ${created}`);
    console.log(`  Ya existían / mismo RUT:   ${skipped}`);
    console.log(`  Sin proveedor en DTE:      ${noProvider}`);
    console.log(`  Sin RUT en descripción TX: ${noRut}`);
    console.log(`${'─'.repeat(60)}`);

    // Resumen final de aliases
    const total = await p.providerAlias.count();
    const bySource = await p.providerAlias.groupBy({ by: ['source'], _count: true });
    console.log(`\nTotal aliases en sistema: ${total}`);
    for (const s of bySource) console.log(`  ${(s.source || 'NULL').padEnd(20)}: ${s._count}`);
}

main().catch(console.error).finally(() => p.$disconnect());
