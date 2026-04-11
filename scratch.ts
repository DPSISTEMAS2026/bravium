import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const org = await prisma.organization.findFirst();
    if (!org) return console.log('No org');
    
    console.log('Org ID:', org.id);
    console.log('Org RUT:', org.libreDteRut);
    
    // Call LibreDte logic directly
    const apiKey = org.libreDteApiKey;
    const companyRut = org.libreDteRut;
    const url = `https://libredte.cl/api/dte/dte_recibidos/buscar/${companyRut}?_contribuyente_rut=${companyRut}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${apiKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fecha_desde: '2025-01-01',
            fecha_hasta: '2026-12-31',
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
    console.log('Total DTEs from API:', dtes.length);
    
    const found = dtes.find((d: any) => Number(d.folio) === 636322);
    if (found) {
        console.log('Found folio 636322 from API:', found);
    } else {
        console.log('Folio 636322 NOT FOUND from API in the period');
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
