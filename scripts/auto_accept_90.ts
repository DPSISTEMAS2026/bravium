import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Aceptando Sugerencias > 90% ---');
    
    const drafts = await prisma.reconciliationMatch.findMany({
        where: {
            status: 'DRAFT',
            confidence: { gte: 0.90 }
        },
        include: {
            dte: true,
            transaction: true
        }
    });

    let accepted = 0;
    for (const match of drafts) {
        if (!match.dte || !match.transaction) continue;
        
        await prisma.reconciliationMatch.update({
            where: { id: match.id },
            data: { 
                status: 'CONFIRMED',
                ruleApplied: match.ruleApplied ? match.ruleApplied + ' [Auto-Aceptado >90%]' : 'Auto-Aceptado >90%',
                confirmedAt: new Date()
            }
        });

        await prisma.bankTransaction.update({
            where: { id: match.transactionId },
            data: { status: 'MATCHED' }
        });

        await prisma.dTE.update({
            where: { id: match.dteId },
            data: { paymentStatus: 'PAID', outstandingAmount: 0 }
        });
        
        accepted++;
        console.log(`✅ Aceptado Folio ${match.dte.folio} <-> Tx [${match.transaction.amount}] (Confianza: ${(match.confidence*100).toFixed(0)}%)`);
    }

    console.log(`\n¡${accepted} sugerencias de alta confianza aceptadas automáticamente!`);
    
    console.log('\n--- Análisis de lo que falta ---');
    const remainingDrafts = await prisma.reconciliationMatch.findMany({
        where: { status: 'DRAFT' },
        include: { dte: true, transaction: true }
    });
    
    console.log(`Quedan ${remainingDrafts.length} sugerencias en DRAFT (< 90%).`);
    
    const noSuggestion = await prisma.bankTransaction.count({
        where: { status: 'PENDING' } // Wait, transactions are completely unmatched.
    });
    
    console.log(`Transacciones bancarias PENDING (sin ninguna sugerencia ni match): ${noSuggestion}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
