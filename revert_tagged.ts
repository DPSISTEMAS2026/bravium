import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('=== REVERTIR MOVIMIENTOS QUE SÍ TRAEN FACTURA ===\n');

    // Categorías que SÍ tienen factura - revertir a PENDING
    const TIENE_FACTURA = [
        /falabella/i, /paris/i, /ripley/i, /oster/i, /rosen/i,
        /viajes tr[eé]bol/i,
        /SAMSUNG/i, /LOGINSA/i,
        /COMPRA NACIONAL/i, /COMPRA NORMAL/i, /COMPRA INT/i,
        /DP\s+\*/i, // DP *FALABELLA.COM etc
        /MP \*SAMSUNG/i, /FLOW\s+\*/i,
        /WEBPAY/i, /EASYCL/i,
        /MP \*DONNAPETI/i, /MP \*VERKENCL/i, /MP \*OSTERCL/i,
        /BAUMART/i, /BAUSMART/i,
        /STHIL/i,
        /TECNOMAS/i,
        /LIDER/i,
        /FURO GROUP/i,
        /Donappet/i, /Verken/i, /Koari/i,
        /AGQS LAB/i,
    ];

    // Categorías que NO traen factura — mantener revisados
    const SIN_FACTURA_KEYWORDS = [
        'sueldo', 'remunerac', 'previred', 'almuerzo', 'desayuno', 'uber',
        'bencina', 'gastos comunes', 'arriendo', 'luz oficina', 'comisión',
        'mantención', 'honorarios', 'ávila', 'avila', 'isidora', 'cristian soto',
        'amanda díaz', 'amanda diaz', 'rafael fuentes', 'compra de divisas',
        'transferencia internacional', 'traspaso.*crédito', 'pago sii',
        'prepago cuotas', 'mercado capitales', 'iva com', 'restaurant',
        'bistrot', 'ticketplus', 'monto cancelado',
    ];

    // Buscar todas las tx que etiquetamos (tienen reviewedBy: EXCEL_PATTERN_MATCH)
    const tagged = await prisma.bankTransaction.findMany({
        where: {
            date: { gte: new Date('2026-01-01') },
            metadata: { path: ['reviewedBy'], equals: 'EXCEL_PATTERN_MATCH' }
        }
    });

    console.log(`Transacciones etiquetadas a revisar: ${tagged.length}\n`);

    let revertidas = 0;
    let mantenidas = 0;

    for (const tx of tagged) {
        const meta = tx.metadata as any;
        const category = (meta?.category || '').toLowerCase();
        const source = (meta?.source || '').toLowerCase();
        const desc = tx.description.toLowerCase();

        // ¿Es un gasto genuino sin factura?
        const esSinFactura = SIN_FACTURA_KEYWORDS.some(kw => {
            const regex = new RegExp(kw, 'i');
            return regex.test(category) || regex.test(desc) || regex.test(source);
        });

        if (esSinFactura) {
            mantenidas++;
            continue; // Mantener como revisado
        }

        // Revertir: quitar metadata de review y poner PENDING
        const { reviewedAt, reviewedBy, category: cat, source: src, noInvoiceExpected, ...cleanMeta } = meta;
        await prisma.bankTransaction.update({
            where: { id: tx.id },
            data: {
                status: 'PENDING',
                metadata: Object.keys(cleanMeta).length > 0 ? cleanMeta : undefined
            }
        });
        revertidas++;
        console.log(`  ↩️  ${tx.date.toISOString().split('T')[0]} $${Math.abs(tx.amount).toLocaleString('es-CL').padStart(12)} | "${tx.description}" → PENDING`);
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`  Revertidas a PENDING: ${revertidas}`);
    console.log(`  Mantenidas como revisadas: ${mantenidas}`);

    const fp = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    const fu = await prisma.bankTransaction.count({ where: { status: 'UNMATCHED' } });
    const fm = await prisma.bankTransaction.count({ where: { status: 'MATCHED' } });
    console.log(`\n  Estado: ${fp} PENDING, ${fu} UNMATCHED, ${fm} MATCHED`);

    await prisma.$disconnect();
}
main().catch(console.error);
