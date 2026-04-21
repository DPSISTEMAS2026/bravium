import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Buscando matches hechos automáticamente ayer que tengan RUT o Proveedor cruzado incorrectamente...");
    
    // Todas las que hizo el script de ayer
    const badMatches = await prisma.reconciliationMatch.findMany({
        where: {
            createdBy: 'SYSTEM_BULK_ACCEPT',
            status: 'CONFIRMED'
        },
        include: {
            transaction: true,
            dte: true
        }
    });

    let wrongCount = 0;
    
    for (const match of badMatches) {
        if (!match.dte || !match.transaction) continue;
        
        const dteName = (match.dte.metadata as any)?.razon_social || '';
        const txDesc = match.transaction.description || '';
        const txProv = (match.transaction.metadata as any)?.providerName || '';
        const txRef = match.transaction.reference || '';

        // Simplista: si el nombre del banco no se parece en NADA al DTE, sospechoso.
        const combinedTxText = `${txDesc} ${txProv} ${txRef}`.toLowerCase();
        
        // Obtenemos primera palabra clave del proveedor del DTE
        const dteKey = dteName.split(' ')[0].toLowerCase();

        if (dteKey.length > 3 && !combinedTxText.includes(dteKey)) {
            // Un error como el de SASCO vs DP SISTEMAS
            console.log(`[ALERTA] Posible cruce erróneo: DTE ${match.dte.folio} (${dteName}) cruzado con Banco (${txDesc} - ${txProv}) - Monto: ${Math.abs(match.transaction.amount)}`);
            wrongCount++;
            
            // Revertir
            await prisma.reconciliationMatch.delete({ where: { id: match.id } });
            
            await prisma.dTE.update({
                where: { id: match.dteId },
                data: { paymentStatus: 'UNPAID', outstandingAmount: Math.abs(match.transaction.amount) }
            });
            
            await prisma.bankTransaction.update({
                where: { id: match.transactionId },
                data: { status: 'PENDING' }
            });
        }
    }

    console.log(`\nRevertidos ${wrongCount} cruces ciegos hechos por montos idénticos.`);

    await prisma.$disconnect();
}
main().catch(console.error);
