import { PrismaClient, DtePaymentStatus, DataOrigin } from '@prisma/client';
import * as https from 'https';

const prisma = new PrismaClient();

function postLibreDte(path: string, apiKey: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const bodyString = JSON.stringify(body);
        const options = {
            hostname: 'libredte.cl',
            path: '/api' + path,
            method: 'POST',
            headers: {
                'Authorization': `Basic ${apiKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Content-Length': bodyString.length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        // Limpiar posibles avisos PHP antes de parsear
                        let cleaned = data.trim();
                        if (cleaned.includes('<br />')) {
                            const jsonStart = cleaned.indexOf('[');
                            if (jsonStart !== -1) cleaned = cleaned.substring(jsonStart);
                        }
                        resolve(JSON.parse(cleaned));
                    } catch (e) {
                        reject(new Error(`Failed to parse response. Data starts with: ${data.substring(0, 100)}`));
                    }
                } else {
                    reject(new Error(`LibreDTE Error ${res.statusCode}: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.write(bodyString);
        req.end();
    });
}

async function processDte(item: any, orgId: string, companyRut: string) {
    const rutIssuer = String(item.emisor);
    const nameIssuer = item.razon_social;
    const dteType = Number(item.dte);
    const folio = Number(item.folio);
    const issuedDateStr = item.fecha;
    const totalAmount = Number(item.total || 0);

    if (!rutIssuer || !dteType || !folio) return 'skipped';

    let provider = await prisma.provider.findFirst({
        where: { rut: rutIssuer, organizationId: orgId }
    });

    if (!provider) {
        provider = await prisma.provider.create({
            data: {
                rut: rutIssuer,
                name: nameIssuer || `Provider ${rutIssuer}`,
                organizationId: orgId
            }
        });
    }

    const existingDTE = await prisma.dTE.findUnique({
        where: {
            rutIssuer_type_folio: {
                rutIssuer,
                type: dteType,
                folio
            }
        }
    });

    if (existingDTE) return 'skipped';

    const isAbono = dteType === 61;

    await prisma.dTE.create({
        data: {
            folio: folio,
            type: dteType,
            rutIssuer: rutIssuer,
            rutReceiver: companyRut,
            totalAmount: totalAmount,
            outstandingAmount: isAbono ? 0 : totalAmount,
            issuedDate: new Date(issuedDateStr),
            dueDate: item.vencimiento ? new Date(item.vencimiento) : null,
            siiStatus: 'RECIBIDO',
            paymentStatus: isAbono ? DtePaymentStatus.PAID : DtePaymentStatus.UNPAID,
            providerId: provider.id,
            origin: DataOrigin.API_INTEGRATION,
            metadata: item
        }
    });

    return 'created';
}

async function main() {
    const orgId = '715545b8-4522-4bb1-be81-3047546c0e8c';
    const org = await prisma.organization.findUnique({ where: { id: orgId } });

    if (!org || !org.libreDteApiKey || !org.libreDteRut) {
        console.error('Org not found or missing credentials');
        return;
    }

    const periods = [
        { start: '2026-01-01', end: '2026-01-31' },
        { start: '2026-02-01', end: '2026-02-28' }
    ];

    for (const period of periods) {
        console.log(`\n--- Sincronizando ${period.start} a ${period.end} ---`);
        try {
            const path = `/dte/dte_recibidos/buscar/${org.libreDteRut}?_contribuyente_rut=${org.libreDteRut}`;
            const data = await postLibreDte(path, org.libreDteApiKey, {
                fecha_desde: period.start,
                fecha_hasta: period.end,
                limit: 1000
            });
            
            const dtes = Array.isArray(data) ? data : (data.data || data.dtes || []);
            console.log(`Encontrados ${dtes.length} DTEs en LibreDTE`);

            let created = 0;
            let skipped = 0;

            for (let i = 0; i < dtes.length; i++) {
                const item = dtes[i];
                console.log(`[${i+1}/${dtes.length}] Procesando Folio: ${item.folio} - Emisor: ${item.emisor}`);
                const res = await processDte(item, orgId, org.libreDteRut!);
                if (res === 'created') created++;
                else skipped++;
            }

            console.log(`Finalizado: ${created} creados, ${skipped} omitidos`);
        } catch (e) {
            console.error(`Error en periodo ${period.start}:`, e);
        }
    }
}

main().finally(() => prisma.$disconnect());
