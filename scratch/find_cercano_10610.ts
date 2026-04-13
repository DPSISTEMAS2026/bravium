import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const org = await prisma.organization.findFirst({
        where: { isActive: true, libreDteApiKey: { not: null } }
    });
    if (!org || !org.libreDteApiKey || !org.libreDteRut) return;

    // Search in Cercano DTEs in our DB
    const cercano = await prisma.provider.findFirst({
        where: { name: { contains: 'CERCANO', mode: 'insensitive' }, organizationId: org.id }
    });

    if (cercano) {
        const cercanoFolios = await prisma.dTE.findMany({
            where: { providerId: cercano.id, folio: { gte: 10600, lte: 10620 } },
            orderBy: { folio: 'asc' },
            select: { folio: true, totalAmount: true, issuedDate: true, paymentStatus: true }
        });
        console.log(`Cercano folios in range 10600-10620:`);
        for (const d of cercanoFolios) {
            console.log(`  F${d.folio} | $${d.totalAmount} | ${d.issuedDate.toISOString().split('T')[0]} | ${d.paymentStatus}`);
        }
    }

    // Search LibreDTE for this folio
    console.log('\nSearching LibreDTE API for Cercano folio 10610...');
    const cercanoRut = cercano ? (await prisma.provider.findUnique({ where: { id: cercano.id } }))?.rut : null;
    
    if (cercanoRut) {
        const url = `https://libredte.cl/api/dte/dte_recibidos/buscar/${org.libreDteRut}?_contribuyente_rut=${org.libreDteRut}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${org.libreDteApiKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fecha_desde: '2025-10-01',
                fecha_hasta: '2026-01-31',
                emisor: cercanoRut,
                limit: 100
            })
        });

        if (response.ok) {
            const text = await response.text();
            let cleaned = text.trim();
            const firstBracket = Math.min(
                cleaned.indexOf('[') === -1 ? cleaned.length : cleaned.indexOf('['),
                cleaned.indexOf('{') === -1 ? cleaned.length : cleaned.indexOf('{')
            );
            if (firstBracket < cleaned.length) cleaned = cleaned.substring(firstBracket);
            const lastBracket = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
            if (lastBracket !== -1) cleaned = cleaned.substring(0, lastBracket + 1);
            const data = JSON.parse(cleaned);
            const dtes = Array.isArray(data) ? data : [];
            
            console.log(`Found ${dtes.length} DTEs from Cercano in LibreDTE:`);
            for (const d of dtes) {
                const marker = d.folio === 10610 ? ' ← MISSING!' : '';
                console.log(`  F${d.folio} T${d.dte} | $${d.total} | ${d.fecha}${marker}`);
            }
        } else {
            console.log(`API Error: ${response.status}`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
