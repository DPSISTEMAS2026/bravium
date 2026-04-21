import { PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';

const prisma = new PrismaClient();
const logger = new Logger('ManualRunner');

async function executeAutoCategoryRules(organizationId: string): Promise<{ categorized: number }> {
    try {
        const rules = await prisma.autoCategoryRule.findMany({
            where: { isActive: true, organizationId },
            include: { provider: true }
        });

        if (rules.length === 0) return { categorized: 0 };

        const pendingTx = await prisma.bankTransaction.findMany({
            where: { status: 'PENDING', bankAccount: { organizationId } },
        });

        if (pendingTx.length === 0) return { categorized: 0 };

        let categorizedCount = 0;

        for (const tx of pendingTx) {
            const desc = tx.description.toLowerCase();
            const matchedRule = rules.find(r => desc.includes(r.keywordMatch.toLowerCase()));
            
            if (matchedRule) {
                await prisma.bankTransaction.update({
                    where: { id: tx.id },
                    data: {
                        status: 'MATCHED',
                        metadata: {
                            ...(typeof tx.metadata === 'object' && tx.metadata ? tx.metadata : {}),
                            reviewNote: `[Auto: ${matchedRule.categoryName}]`,
                            autoCategorized: true,
                            ruleId: matchedRule.id
                        },
                    }
                });
                logger.log(`Auto-categorized TX ${tx.id} (${tx.description}) using rule "${matchedRule.categoryName}"`);
                categorizedCount++;
            }
        }

        return { categorized: categorizedCount };
    } catch (error: any) {
        logger.error(`Error: ${error.message}`);
        return { categorized: 0 };
    }
}

async function run() {
    try {
        // Find the org from the rules that exist
        const anyRule = await prisma.autoCategoryRule.findFirst();
        if (anyRule && anyRule.organizationId) {
             const res = await executeAutoCategoryRules(anyRule.organizationId);
             console.log('Result:', res);
        }
    } finally {
        await prisma.$disconnect();
    }
}

run();
