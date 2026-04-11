import { PrismaClient, DtePaymentStatus, DataOrigin } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const org = await prisma.organization.findFirst();
    if (!org) return console.log('No org');
    
    const organizationId = org.id;
    const apiKey = org.libreDteApiKey;
    const companyRut = org.libreDteRut;

    if (!apiKey || !companyRut) {
        return console.log('Credenciales de LibreDTE faltantes');
    }

    const url = `https://libredte.cl/api/dte/dte_recibidos/buscar/${companyRut}?_contribuyente_rut=${companyRut}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${apiKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fecha_desde: '2026-03-01',
            fecha_hasta: '2026-03-31',
            limit: 5000 
        })
    });
    
    if (!response.ok) {
        console.log('Error from API:', response.status);
        return;
    }
    
    const rawText = await response.text();
    let cleaned = rawText.trim();
    const firstBracket = Math.min(
        cleaned.indexOf('[') === -1 ? cleaned.length : cleaned.indexOf('['),
        cleaned.indexOf('{') === -1 ? cleaned.length : cleaned.indexOf('{')
    );
    if (firstBracket < cleaned.length) {
        cleaned = cleaned.substring(firstBracket);
    }
    const lastBracket = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
    if (lastBracket !== -1) {
        cleaned = cleaned.substring(0, lastBracket + 1);
    }
    const data = JSON.parse(cleaned);
    const dtes = Array.isArray(data) ? data : (data.data || data.dtes || []);
    
    const item = dtes.find((d: any) => Number(d.folio) === 636322);
    if (!item) {
        console.log('Folio 636322 no encontrado en la API para Marzo 2026');
        return;
    }

    console.log('Folio encontrado, insertando...');
    
    const rutIssuer = String(item.emisor);
    const nameIssuer = item.razon_social;
    const dteType = Number(item.dte);
    const folio = Number(item.folio);
    const issuedDateStr = item.fecha; // YYYY-MM-DD
    const totalAmount = Number(item.total || 0);

    // 1. Upsert Provider
    let provider = await prisma.provider.findFirst({
        where: { rut: rutIssuer, organizationId }
    });

    if (!provider) {
        provider = await prisma.provider.create({
            data: {
                rut: rutIssuer,
                name: nameIssuer || `Provider ${rutIssuer}`,
                organizationId
            }
        });
        console.log(`Proveedor creado: ${rutIssuer}`);
    }

    // 2. Check if DTE already exists
    const existingDTE = await prisma.dTE.findUnique({
        where: {
            rutIssuer_type_folio: {
                rutIssuer,
                type: dteType,
                folio
            }
        }
    });

    if (existingDTE && existingDTE.providerId === provider.id) {
        console.log(`DTE ya existe en el sistema`);
        return;
    }

    const isNotaCredito = dteType === 61;
    const isAbono = isNotaCredito;

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

    console.log(`✅ ¡Folio 636322 ingestado exitosamente al sistema!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
