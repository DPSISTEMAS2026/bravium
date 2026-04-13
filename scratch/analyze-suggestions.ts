import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- ANÁLISIS DE SUGERENCIAS DE MATCHS ---');

    // 1. ReconciliationMatch con status DRAFT (Sugerencias 1:1)
    const draftMatches = await prisma.reconciliationMatch.findMany({
        where: {
            status: 'DRAFT',
        },
        select: {
            id: true,
            createdAt: true,
            ruleApplied: true,
            organizationId: true
        }
    });

    // 2. MatchSuggestion (Sugerencias N:1 o SPLIT)
    const matchSuggestions = await prisma.matchSuggestion.findMany({
        where: {
            status: 'PENDING',
        },
        select: {
            id: true,
            createdAt: true,
            type: true,
            organizationId: true
        }
    });

    console.log(`Total 1:1 Sugerencias (ReconciliationMatch DRAFT): ${draftMatches.length}`);
    console.log(`Total N:1/SPLIT Sugerencias (MatchSuggestion PENDING): ${matchSuggestions.length}`);

    const groupResult = (items: any[]) => {
        const counts: Record<string, number> = {};
        items.forEach(item => {
            const date = item.createdAt.toISOString().split('T')[0];
            counts[date] = (counts[date] || 0) + 1;
        });
        return counts;
    };

    console.log('\nSugerencias 1:1 por fecha de creación:');
    console.table(groupResult(draftMatches));

    console.log('\nSugerencias N:1/SPLIT por fecha de creación:');
    console.table(groupResult(matchSuggestions));

    // Filtrar específicamente por Bravium si es posible
    // Bravium ID fue encontrado antes como 715545b8-4522-4bb1-be81-3047546c0e8c (creo, verificaré)
    const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
    console.log('\nOrganizaciones:', orgs);

    for (const org of orgs) {
        console.log(`\n--- Org: ${org.name} ---`);
        const orgDrafts = draftMatches.filter(m => m.organizationId === org.id);
        const orgSuggestions = matchSuggestions.filter(s => s.organizationId === org.id);
        
        console.log(`  Sugerencias 1:1: ${orgDrafts.length}`);
        console.log(`  Sugerencias N:1: ${orgSuggestions.length}`);
        
        const draftsByDate = groupResult(orgDrafts);
        const suggestionsByDate = groupResult(orgSuggestions);
        
        if (orgDrafts.length > 0) {
            console.log('  1:1 por fecha:', draftsByDate);
        }
        if (orgSuggestions.length > 0) {
            console.log('  N:1 por fecha:', suggestionsByDate);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
