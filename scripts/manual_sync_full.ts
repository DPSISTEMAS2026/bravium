import { PrismaClient } from '@prisma/client';
import { LibreDteService } from '../src/modules/ingestion/services/libredte.service';
import { ConciliacionService } from '../src/modules/conciliacion/conciliacion.service';
import { ExactMatchStrategy } from '../src/modules/conciliacion/strategies/exact-match.strategy';
import { AmountMatchStrategy } from '../src/modules/conciliacion/strategies/amount-match.strategy';
import { SumMatchStrategy } from '../src/modules/conciliacion/strategies/sum-match.strategy';
import { SplitPaymentMatchStrategy } from '../src/modules/conciliacion/strategies/split-payment-match.strategy';
import { DataVisibilityService } from '../src/common/services/data-visibility.service';

const prisma = new PrismaClient();

async function main() {
    const org = await prisma.organization.findFirst({
        where: { slug: 'bravium' }
    });

    if (!org) {
        console.error('Org bravium not found');
        return;
    }

    console.log(`Manual Sync for Org: ${org.name}`);

    // mock dependencies for services
    const visibility = new DataVisibilityService(prisma);
    const exact = new ExactMatchStrategy(prisma);
    const amount = new AmountMatchStrategy(prisma);
    const sumMatch = new SumMatchStrategy(prisma);
    const split = new SplitPaymentMatchStrategy(prisma);
    
    // @ts-ignore
    const libreDte = new LibreDteService(prisma);
    // @ts-ignore
    const conciliacion = new ConciliacionService(prisma, exact, amount, sumMatch, split, visibility);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const fromDate = sixtyDaysAgo.toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];

    console.log(`\n1. Running LibreDTE Sync from ${fromDate} to ${toDate}...`);
    const syncResult = await libreDte.fetchReceivedDTEs(fromDate, toDate, org.id);
    console.log('Sync Result:', syncResult);

    console.log(`\n2. Running Auto-Match from ${fromDate} to ${toDate}...`);
    const matchResult = await conciliacion.runReconciliationCycle(fromDate, toDate, org.id);
    console.log('Match Result:', matchResult);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
