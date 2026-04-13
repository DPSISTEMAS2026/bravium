import { PrismaClient } from '@prisma/client';

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
        body: JSON.stringify({ fecha_desde: fromDate, fecha_hasta: toDate, limit: 1000 })
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
    const org = await prisma.organization.findFirst({
        where: { isActive: true, libreDteApiKey: { not: null } }
    });
    if (!org || !org.libreDteApiKey || !org.libreDteRut) {
        console.error('No org found'); return;
    }

    console.log(`\n🔍 RE-SCANNING DECEMBER 2025 for ${org.name}\n`);

    const apiDtes = await fetchDTEsForPeriod(org.libreDteApiKey, org.libreDteRut, '2025-12-01', '2025-12-31');
    console.log(`Got ${apiDtes.length} DTEs from API for Dec 2025`);

    let newCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    for (const item of apiDtes) {
        const rutIssuer = String(item.emisor || '').trim();
        const dteType = Number(item.dte);
        const folio = Number(item.folio);
        const totalAmount = Number(item.total || 0);

        if (!rutIssuer || !dteType || !folio) {
            console.log(`  SKIP invalid: emisor=${item.emisor}, dte=${item.dte}, folio=${item.folio}`);
            continue;
        }

        try {
            const exists = await prisma.dTE.findFirst({
                where: {
                    rutIssuer,
                    type: dteType,
                    folio,
                    organizationId: org.id
                },
                select: { id: true }
            });

            if (exists) {
                existingCount++;
                continue;
            }

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
            await prisma.dTE.create({
                data: {
                    folio,
                    type: dteType,
                    rutIssuer,
                    rutReceiver: org.libreDteRut!,
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
            newCount++;
            console.log(`  🆕 Created: ${rutIssuer} T${dteType} F${folio} $${totalAmount} (${item.razon_social})`);
        } catch (e: any) {
            errorCount++;
            console.log(`  ❌ Error on F${folio} T${dteType} ${rutIssuer}: ${e.message.slice(0, 120)}`);
        }
    }

    console.log(`\n========================================`);
    console.log(`DECEMBER RESCAN COMPLETE`);
    console.log(`========================================`);
    console.log(`From API: ${apiDtes.length}`);
    console.log(`New: ${newCount}`);
    console.log(`Existing: ${existingCount}`);
    console.log(`Errors: ${errorCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
