import { PrismaClient, DtePaymentStatus, DataOrigin } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const orgId = '715545b8-4522-4bb1-be81-3047546c0e8c';
    const companyRut = '77154188';

    const itemsToIngest = [
        {
            emisor: "76714223",
            razon_social: 'LE BISTROT DU VIET NAM LIMITADA',
            dte: 33,
            folio: 1049,
            fecha: '2026-03-10',
            total: 196500
        },
        {
            emisor: "78911500",
            razon_social: 'SERVICIOS FELLAY Y AMENABAR LTDA',
            dte: 33,
            folio: 10155,
            fecha: '2026-03-10',
            total: 116620
        }
    ];

    for (const item of itemsToIngest) {
        console.log(`Ingesting Folio: ${item.folio}...`);
        
        // 1. Get or create provider
        let provider = await prisma.provider.findFirst({
            where: { rut: String(item.emisor), organizationId: orgId }
        });

        if (!provider) {
            provider = await prisma.provider.create({
                data: {
                    rut: String(item.emisor),
                    name: item.razon_social,
                    organizationId: orgId
                }
            });
        }

        // 2. Create DTE if not exists
        await prisma.dTE.upsert({
            where: {
                rutIssuer_type_folio: {
                    rutIssuer: String(item.emisor),
                    type: item.dte,
                    folio: item.folio
                }
            },
            update: {},
            create: {
                folio: item.folio,
                type: item.dte,
                rutIssuer: String(item.emisor),
                rutReceiver: companyRut,
                totalAmount: item.total,
                outstandingAmount: item.total,
                issuedDate: new Date(item.fecha),
                siiStatus: 'RECIBIDO',
                paymentStatus: DtePaymentStatus.UNPAID,
                providerId: provider.id,
                origin: DataOrigin.API_INTEGRATION,
                metadata: item
            }
        });
        console.log(`✅ Folio ${item.folio} ingested.`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
