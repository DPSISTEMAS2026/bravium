import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TransactionStatus, Prisma } from '@prisma/client';

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
            const rulesWhere: any = { isActive: true };
            const providerWhere: any = {};
            if (organizationId) {
                rulesWhere['organizationId'] = organizationId;
                providerWhere['organizationId'] = organizationId;
            }
            const rules = await this.prisma.autoCategoryRule.findMany({
                where: rulesWhere,
                include: { provider: true } // Need this to optionally link the tx to a provider
            });

            const providers = await this.prisma.provider.findMany({
                where: providerWhere,
                include: { aliases: true }
            });

            // Fetch pending transactions
            const txWhere: Prisma.BankTransactionWhereInput = { status: TransactionStatus.PENDING };
            if (organizationId) {
                txWhere.bankAccount = { organizationId };
            }
            const pendingTx = await this.prisma.bankTransaction.findMany({
                where: txWhere,
            });

            if (pendingTx.length === 0) return { categorized: 0 };

            let categorizedCount = 0;
            const cleanRut = (rut: string) => rut.replace(/\./g, '').toUpperCase();

            // Iterate over transactions and apply rules
            for (const tx of pendingTx) {
                const desc = tx.description.toLowerCase();
                const descUpper = tx.description.toUpperCase();
                let matchedProvider = false;

                // 1. Buscar Proveedor por RUT o Alias en la glosa
                for (const provider of providers) {
                    const pRut = cleanRut(provider.rut);
                    const pRutNoDv = pRut.split('-')[0];
                    let hasRut = false;
                    const cleanPRutNoDv = pRutNoDv.replace(/[^0-9K]/g, '');
                    
                    if (cleanPRutNoDv.length >= 6 && cleanPRutNoDv !== '000000') {
                        const cleanDesc = descUpper.replace(/[^0-9K]/g, '');
                        hasRut = cleanDesc.includes(cleanPRutNoDv);
                    }
                    
                    const hasAlias = provider.aliases.some(alias => 
                        alias.description && descUpper.includes(alias.description.toUpperCase())
                    );

                    if (hasRut || hasAlias) {
                        await this.prisma.bankTransaction.update({
                            where: { id: tx.id },
                            data: {
                                status: TransactionStatus.PENDING, // Mantiene PENDING para asignación masiva
                                metadata: {
                                    ...(typeof tx.metadata === 'object' && tx.metadata ? tx.metadata : {}),
                                    identifiedProviderId: provider.id,
                                    identifiedProviderName: provider.name,
                                    autoCategorized: false
                                }
                            }
                        });
                        this.logger.log(`Identified Provider for TX ${tx.id} via RUT/Alias: ${provider.name}`);
                        matchedProvider = true;
                        categorizedCount++;
                        break;
                    }
                }

                if (matchedProvider) continue; // Ya se identificó para masiva, no aplicar reglas de gasto fijo
                
                // 2. Find first matching Gasto Fijo rule
                const matchedRule = rules.find(r => desc.includes(r.keywordMatch.toLowerCase()));
                
                if (matchedRule) {
                    await this.prisma.bankTransaction.update({
                        where: { id: tx.id },
                        data: {
                            status: TransactionStatus.MATCHED,
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
        const rule = await this.prisma.autoCategoryRule.create({
            data: {
                organizationId,
                keywordMatch: keywordMatch.toLowerCase(),
                categoryName,
                providerId,
                isActive: true
            }
        });

        // Ejecutar las reglas retroactivamente sobre transacciones pendientes para dar feedback inmediato
        await this.executeAutoCategoryRules(organizationId);

        return rule;
    }

    async deleteRule(id: string, organizationId: string) {
        // Enforce organizationId for security
        return this.prisma.autoCategoryRule.delete({
            where: { id, organizationId }
        });
    }

    async getRuleTransactions(id: string, organizationId: string) {
        return this.prisma.bankTransaction.findMany({
            where: {
                bankAccount: { organizationId },
                metadata: {
                    path: ['ruleId'],
                    equals: id
                }
            },
            include: { bankAccount: true },
            orderBy: { date: 'desc' },
            take: 100
        });
    }
}
