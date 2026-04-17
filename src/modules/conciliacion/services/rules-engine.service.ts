import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class RulesEngineService {
    private readonly logger = new Logger(RulesEngineService.name);

    constructor(private prisma: PrismaService) {}

    /**
     * Executes auto-categorization rules on pending transactions
     * Should be called at the end of the reconciliation cycle
     */
    async executeAutoCategoryRules(organizationId?: string): Promise<{ categorized: number }> {
        try {
            // Fetch all active rules
            const rulesWhere = { isActive: true };
            if (organizationId) {
                rulesWhere['organizationId'] = organizationId;
            }
            const rules = await this.prisma.autoCategoryRule.findMany({
                where: rulesWhere,
                include: { provider: true } // Need this to optionally link the tx to a provider
            });

            if (rules.length === 0) return { categorized: 0 };

            // Fetch pending transactions
            const txWhere = { status: 'PENDING' };
            if (organizationId) {
                txWhere['bankAccount'] = { organizationId };
            }
            const pendingTx = await this.prisma.bankTransaction.findMany({
                where: txWhere,
            });

            if (pendingTx.length === 0) return { categorized: 0 };

            let categorizedCount = 0;

            // Iterate over transactions and apply rules
            for (const tx of pendingTx) {
                const desc = tx.description.toLowerCase();
                
                // Find first matching rule
                const matchedRule = rules.find(r => desc.includes(r.keywordMatch.toLowerCase()));
                
                if (matchedRule) {
                    await this.prisma.bankTransaction.update({
                        where: { id: tx.id },
                        data: {
                            status: 'REVIEWED',
                            metadata: {
                                ...(typeof tx.metadata === 'object' && tx.metadata ? tx.metadata : {}),
                                reviewNote: `[Auto: ${matchedRule.categoryName}]`,
                                autoCategorized: true,
                                ruleId: matchedRule.id
                            },
                        }
                    });
                    this.logger.log(`Auto-categorized TX ${tx.id} (${tx.description}) using rule "${matchedRule.categoryName}"`);
                    categorizedCount++;
                }
            }

            return { categorized: categorizedCount };

        } catch (error) {
            this.logger.error(`Error executing auto-categorization rules: ${error.message}`);
            return { categorized: 0 };
        }
    }

    async getRules(organizationId: string) {
        return this.prisma.autoCategoryRule.findMany({
            where: { organizationId },
            include: { provider: true },
            orderBy: { createdAt: 'desc' }
        });
    }

    async createRule(organizationId: string, keywordMatch: string, categoryName: string, providerId?: string) {
        return this.prisma.autoCategoryRule.create({
            data: {
                organizationId,
                keywordMatch: keywordMatch.toLowerCase(),
                categoryName,
                providerId,
                isActive: true
            }
        });
    }

    async deleteRule(id: string, organizationId: string) {
        // Enforce organizationId for security
        return this.prisma.autoCategoryRule.delete({
            where: { id, organizationId }
        });
    }
}
