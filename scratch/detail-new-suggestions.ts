import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- DETALLE DE NUEVAS SUGERENCIAS BRAVIUM (12 de Abril) ---');
    const braviumId = '715545b8-4522-4bb1-be81-3047546c0e8c';

    const newDrafts = await prisma.reconciliationMatch.findMany({
        where: {
            organizationId: braviumId,
            status: 'DRAFT',
            createdAt: {
                gte: new Date('2026-04-10T00:00:00Z')
            }
        },
        include: {
            transaction: true,
            dte: {
                include: {
                    provider: true
                }
            }
        }
    });

    console.log(`Encontradas ${newDrafts.length} nuevas sugerencias 1:1.`);

    const summary = newDrafts.map(match => ({
        FechaTx: match.transaction?.date.toISOString().split('T')[0],
        Monto: match.transaction?.amount,
        Proveedor: match.dte?.provider?.name || match.dte?.rutIssuer,
        Folio: match.dte?.folio,
        Regla: match.ruleApplied
    }));

    console.table(summary);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
