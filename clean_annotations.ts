import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('=== LIMPIEZA DE ANOTACIONES ===\n');

    // Buscar todos los que acabamos de anotar (tienen reviewedAt reciente y status UNMATCHED)
    const annotatedTxs = await prisma.bankTransaction.findMany({
        where: { status: 'UNMATCHED' }
    });

    let revertedToPending = 0;
    let cleanedNote = 0;

    for (const tx of annotatedTxs) {
        const meta = (tx.metadata as Record<string, any>) || {};
        if (!meta.reviewNote) continue;

        const note = String(meta.reviewNote);
        const excelItem = String(meta.excelItem || '').toLowerCase();
        const excelDetalle = String(meta.excelDetalle || '').toLowerCase();
        const excelComentario = String(meta.excelComentario || '').toLowerCase();

        // Detectar si es "factura electrónica" o "boleta electrónica" o "boleta" sin más contexto
        // Estos deben volver a PENDING porque eventualmente el proveedor emitirá el DTE
        const combined = `${excelItem} ${excelDetalle} ${excelComentario}`.toLowerCase();
        
        const isFacturaPendiente = (
            combined.includes('factura electr') ||
            combined.includes('factura electrónica') ||
            (combined.includes('boleta') && !combined.includes('rafael') && !combined.includes('fuentes'))
        );

        // Si SOLO dice "factura electrónica" o "boleta" sin más info útil, revertir a PENDING
        // Verificar que no tenga otro detalle útil como "Arriendo", "Rendicion", etc.
        const hasUsefulDetail = (
            combined.includes('arriendo') ||
            combined.includes('rendicion') ||
            combined.includes('sueldo') ||
            combined.includes('remunerac') ||
            combined.includes('imposicion') ||
            combined.includes('rafael') ||
            combined.includes('bencina') ||
            combined.includes('almuerzo') ||
            combined.includes('desayuno') ||
            combined.includes('luz') ||
            combined.includes('enel') ||
            combined.includes('provision') ||
            combined.includes('inversion') ||
            combined.includes('deposito') ||
            combined.includes('pago tc') ||
            combined.includes('despacho') ||
            combined.includes('amazon') ||
            combined.includes('compra falabella') ||
            combined.includes('experiencia') ||
            combined.includes('articulos') ||
            combined.includes('servicios') ||
            combined.includes('plan tomado') ||
            combined.includes('kano') ||
            combined.includes('test') ||
            combined.includes('prueba') ||
            combined.includes('transporte') ||
            combined.includes('diferencia') ||
            combined.includes('arreglo') ||
            combined.includes('panificio') ||
            combined.includes('loginsa') ||
            combined.includes('coleman') ||
            combined.includes('rideshop') ||
            combined.includes('sodimac') ||
            combined.includes('booz') ||
            combined.includes('ripley') ||
            combined.includes('luis munoz') ||
            combined.includes('mikel') ||
            combined.includes('jonathan') ||
            combined.includes('arcoveg') ||
            combined.includes('cancelada') ||
            combined.includes('anula') ||
            combined.includes('duplicado')
        );

        if (isFacturaPendiente && !hasUsefulDetail) {
            // Revertir: quitar anotación y volver a PENDING
            delete meta.reviewNote;
            delete meta.excelItem;
            delete meta.excelDetalle;
            delete meta.excelComentario;
            delete meta.excelFechaPago;
            delete meta.reviewedAt;

            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: { status: 'PENDING', metadata: meta }
            });

            revertedToPending++;
            console.log(`  ⏪ REVERTIDO a PENDING: $${tx.amount} (${tx.date.toISOString().split('T')[0]}) - era "${note}"`);
            continue;
        }

        // Para los que se quedan anotados: limpiar el prefijo "[Excel XXXX 2026] "
        const cleanedReviewNote = note.replace(/\[Excel [A-Z]+ 2026\] /i, '');
        meta.reviewNote = cleanedReviewNote;

        await prisma.bankTransaction.update({
            where: { id: tx.id },
            data: { metadata: meta }
        });

        cleanedNote++;
        console.log(`  ✏️ LIMPIADO: $${tx.amount} (${tx.date.toISOString().split('T')[0]}) → "${cleanedReviewNote}"`);
    }

    console.log('\n==========================================================');
    console.log('  RESUMEN');
    console.log('==========================================================');
    console.log(`  Revertidos a PENDING (tienen factura pendiente):  ${revertedToPending}`);
    console.log(`  Anotación limpiada (sin prefijo Excel):          ${cleanedNote}`);
    console.log('==========================================================');

    const finalPending = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    const finalUnmatched = await prisma.bankTransaction.count({ where: { status: 'UNMATCHED' } });
    console.log(`\n  Estado: ${finalPending} PENDING, ${finalUnmatched} UNMATCHED (anotados)`);

    await prisma.$disconnect();
}
main().catch(console.error);
