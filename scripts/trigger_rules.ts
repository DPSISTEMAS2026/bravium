import { PrismaClient, TransactionStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- FORZANDO REGLAS DE AUTO-CATEGORIZACIÓN ---');
    const rules = await prisma.autoCategoryRule.findMany({
        where: { isActive: true }
    });

    if (rules.length === 0) {
        console.log('No hay reglas activas.');
        return;
    }

    console.log(`Reglas activas encontradas: ${rules.length}`);
    for(const r of rules) {
        console.log(`- ${r.keywordMatch} => ${r.categoryName}`);
    }

    const pendingTx = await prisma.bankTransaction.findMany({
        where: { status: 'PENDING' },
    });

    console.log(`Analizando ${pendingTx.length} transacciones bancarias pendientes...`);
    
    let cCount = 0;
    for (const tx of pendingTx) {
        const desc = (tx.description || '').toLowerCase();
        
        const matchedRule = rules.find(r => desc.includes(r.keywordMatch.toLowerCase()));
        
        if (matchedRule) {
            await prisma.bankTransaction.update({
                where: { id: tx.id },
                data: {
                    status: 'MATCHED',
                    metadata: {
                        ...(typeof tx.metadata === 'object' && tx.metadata ? tx.metadata as any : {}),
                        reviewNote: `[Auto: ${matchedRule.categoryName}]`,
                        autoCategorized: true,
                        ruleId: matchedRule.id
                    },
                }
            });
            console.log(`✅ [Regla: ${matchedRule.categoryName}] -> Tx ID: ${tx.id.substring(0,8)} - ${tx.description} ($${tx.amount})`);
            cCount++;
        }
    }

    console.log(`\n🎉 Procedimiento finalizado. ${cCount} transacciones auto-categorizadas.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
