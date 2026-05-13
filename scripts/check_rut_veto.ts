import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
    const prov = await p.provider.findFirst({ where: { rut: { contains: '89171600' } } });
    console.log('Proveedor con 89171600:', prov?.name, 'RUT:', prov?.rut);

    const alias = await p.providerAlias.findMany({
        where: { rut: { contains: '891716' } },
        include: { provider: { select: { name: true, rut: true } } }
    });
    console.log('Aliases con 891716:', alias.map(a => `${a.rut} → ${a.provider.name}`));

    const veto = await p.provider.findFirst({ where: { name: { contains: 'VETO' } } });
    console.log('VETO Y CIA:', veto?.name, 'RUT:', veto?.rut);

    // Ver aliases de VETO Y CIA
    if (veto) {
        const vetoAliases = await p.providerAlias.findMany({ where: { providerId: veto.id } });
        console.log('Aliases de VETO:', vetoAliases.map(a => a.rut));
    }
}
main().catch(console.error).finally(() => p.$disconnect());
