import { PrismaClient } from '@prisma/client';

/**
 * Runs a deep scan against LibreDTE to find DTEs that were missed by
 * the incremental sync. This queries every month from the start date.
 * 
 * Usage: npx ts-node scratch/run_deep_scan.ts [startDate]
 * Example: npx ts-node scratch/run_deep_scan.ts 2025-09-01
 */

const prisma = new PrismaClient();

const API_URL = 'https://libredte.cl/api';

async function fetchDTEsForPeriod(apiKey: string, companyRut: string, fromDate: string, toDate: string) {
    const url = `${API_URL}/dte/dte_recibidos/buscar/${companyRut}?_contribuyente_rut=${companyRut}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${apiKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fecha_desde: fromDate,
            fecha_hasta: toDate,
            limit: 1000
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LibreDTE API Error: ${response.status} - ${errorText.slice(0, 200)}`);
    }

    const rawText = await response.text();
    let cleaned = rawText.trim();
    const firstBracket = Math.min(
        cleaned.indexOf('[') === -1 ? cleaned.length : cleaned.indexOf('['),
        cleaned.indexOf('{') === -1 ? cleaned.length : cleaned.indexOf('{')
    );
    if (firstBracket < cleaned.length) cleaned = cleaned.substring(firstBracket);
    const lastBracket = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
    if (lastBracket !== -1) cleaned = cleaned.substring(0, lastBracket + 1);

    const data = JSON.parse(cleaned);
    return Array.isArray(data) ? data : (data.data || data.dtes || []);
}

async function main() {
    const startFrom = process.argv[2] || '2025-09-01';

    // Get org credentials
    const org = await prisma.organization.findFirst({
        where: { isActive: true, libreDteApiKey: { not: null } }
    });

    if (!org || !org.libreDteApiKey || !org.libreDteRut) {
        console.error('No active organization with LibreDTE credentials found');
        return;
    }

    console.log(`\n🔍 DEEP SCAN for ${org.name} (${org.slug})`);
    console.log(`   RUT: ${org.libreDteRut}`);
    console.log(`   Scanning from: ${startFrom}\n`);

    // Build monthly chunks
    const cursor = new Date(startFrom);
    cursor.setDate(1);
    const today = new Date();
    const months: { from: string; to: string }[] = [];

    while (cursor <= today) {
        const monthStart = cursor.toISOString().split('T')[0];
        const nextMonth = new Date(cursor);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(0);
        const monthEnd = nextMonth > today
            ? today.toISOString().split('T')[0]
            : nextMonth.toISOString().split('T')[0];
        months.push({ from: monthStart, to: monthEnd });
        cursor.setMonth(cursor.getMonth() + 1);
        cursor.setDate(1);
    }

    let totalNew = 0;
    let totalExisting = 0;
    let totalFromApi = 0;

    for (const { from, to } of months) {
        process.stdout.write(`  📅 ${from} → ${to} ... `);

        try {
            const apiDtes = await fetchDTEsForPeriod(org.libreDteApiKey, org.libreDteRut, from, to);
            let newCount = 0;
            let existingCount = 0;

            for (const item of apiDtes) {
                const rutIssuer = String(item.emisor);
                const dteType = Number(item.dte);
                const folio = Number(item.folio);

                if (!rutIssuer || !dteType || !folio) continue;

                const exists = await prisma.dTE.findUnique({
                    where: {
                        rutIssuer_type_folio_organizationId: {
                            rutIssuer,
                            type: dteType,
                            folio,
                            organizationId: org.id
                        }
                    },
                    select: { id: true }
                });

                if (exists) {
                    existingCount++;
                } else {
                    newCount++;
                    // Upsert provider
                    let provider = await prisma.provider.findFirst({
                        where: { rut: rutIssuer, organizationId: org.id }
                    });
                    if (!provider) {
                        provider = await prisma.provider.create({
                            data: {
                                rut: rutIssuer,
                                name: item.razon_social || `Provider ${rutIssuer}`,
                                organizationId: org.id
                            }
                        });
                    }

                    const isNC = dteType === 61;
                    const totalAmount = Number(item.total || 0);

                    await prisma.dTE.create({
                        data: {
                            folio,
                            type: dteType,
                            rutIssuer,
                            rutReceiver: org.libreDteRut,
                            totalAmount,
                            outstandingAmount: isNC ? 0 : totalAmount,
                            issuedDate: new Date(item.fecha),
                            dueDate: item.vencimiento ? new Date(item.vencimiento) : null,
                            siiStatus: 'RECIBIDO',
                            paymentStatus: isNC ? 'PAID' : 'UNPAID',
                            providerId: provider.id,
                            organizationId: org.id,
                            origin: 'API_INTEGRATION',
                            metadata: item
                        }
                    });
                }
            }

            totalFromApi += apiDtes.length;
            totalNew += newCount;
            totalExisting += existingCount;

            if (newCount > 0) {
                console.log(`🆕 ${newCount} NEW | ${existingCount} existing (${apiDtes.length} from API)`);
            } else {
                console.log(`✓ ${existingCount} existing (${apiDtes.length} from API)`);
            }
        } catch (e: any) {
            console.log(`❌ Error: ${e.message.slice(0, 100)}`);
        }
    }

    console.log(`\n========================================`);
    console.log(`DEEP SCAN COMPLETE`);
    console.log(`========================================`);
    console.log(`Months scanned: ${months.length}`);
    console.log(`Total from API: ${totalFromApi}`);
    console.log(`New DTEs created: ${totalNew}`);
    console.log(`Already existed: ${totalExisting}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
