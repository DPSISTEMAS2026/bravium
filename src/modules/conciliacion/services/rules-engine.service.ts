import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TransactionStatus, Prisma } from '@prisma/client';
import { isExcelGastoFijo } from './excel-pattern-learner.service';

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

            // Cargar todos los alias de glosas para búsqueda rápida (sistema de "memoria")
            const allAliases = await this.prisma.glosaCategoryAlias.findMany({
                include: { rule: true },
            });

            // Índice: glosaNormalized → { ruleId, categoryName }
            const aliasIndex = new Map<string, { ruleId: string; categoryName: string }>();
            for (const alias of allAliases) {
                aliasIndex.set(alias.glosaNormalized, {
                    ruleId: alias.ruleId,
                    categoryName: alias.rule.categoryName,
                });
            }

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
                    
                    const matchingAliases = provider.aliases.filter(alias =>
                        alias.description && descUpper.includes(alias.description.toUpperCase())
                    );
                    const hasAlias = matchingAliases.length > 0;
                    const isMunicipalGlosa = /\bMUNI(?:CIPALIDAD)?\b/i.test(tx.description || '');
                    const isMunicipalProvider = /MUNI(?:CIPALIDAD)?|PATENTE/i.test(provider.name || '');
                    if (isMunicipalGlosa && !isMunicipalProvider && (hasRut || hasAlias)) {
                        continue;
                    }

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

                // 2. Buscar en la "memoria" de aliases de glosas (GlosaCategoryAlias)
                const descNorm = this.normalizeGlosaForSearch(tx.description);
                const aliasMatch = aliasIndex.get(descNorm);

                if (aliasMatch) {
                    const closes = isExcelGastoFijo(aliasMatch.categoryName);
                    await this.prisma.bankTransaction.update({
                        where: { id: tx.id },
                        data: {
                            status: closes ? TransactionStatus.MATCHED : TransactionStatus.PENDING,
                            metadata: {
                                ...(typeof tx.metadata === 'object' && tx.metadata ? tx.metadata : {}),
                                reviewNote: `[Auto: ${aliasMatch.categoryName}]`,
                                autoCategorized: true,
                                category: aliasMatch.categoryName,
                                ruleName: aliasMatch.categoryName,
                                ruleId: aliasMatch.ruleId
                            },
                        }
                    });

                    // Incrementar contador de la regla y del alias
                    await Promise.all([
                        this.prisma.autoCategoryRule.update({
                            where: { id: aliasMatch.ruleId },
                            data: { matchCount: { increment: 1 } },
                        }),
                        this.prisma.glosaCategoryAlias.updateMany({
                            where: { ruleId: aliasMatch.ruleId, glosaNormalized: descNorm },
                            data: { timesMatched: { increment: 1 }, lastSeenAt: new Date() },
                        }),
                    ]);

                    this.logger.log(`Auto-categorized TX ${tx.id} via ALIAS MEMORY: "${tx.description}" → "${aliasMatch.categoryName}"`);
                    if (/MUNI|MUNICIPALIDAD|PATENTE/i.test(`${tx.description} ${aliasMatch.categoryName}`)) {
                    }
                    categorizedCount++;
                    continue;
                }
                
                // 3. Find first matching Gasto Fijo rule by keyword
                const matchedRule = rules.find(r => desc.includes(r.keywordMatch.toLowerCase()));
                
                if (matchedRule) {
                    const closes = isExcelGastoFijo(matchedRule.categoryName);
                    await this.prisma.bankTransaction.update({
                        where: { id: tx.id },
                        data: {
                            status: closes ? TransactionStatus.MATCHED : TransactionStatus.PENDING,
                            metadata: {
                                ...(typeof tx.metadata === 'object' && tx.metadata ? tx.metadata : {}),
                                reviewNote: `[Auto: ${matchedRule.categoryName}]`,
                                autoCategorized: true,
                                category: matchedRule.categoryName,
                                ruleName: matchedRule.categoryName,
                                ruleId: matchedRule.id
                            },
                        }
                    });

                    // Incrementar matchCount de la regla
                    await this.prisma.autoCategoryRule.update({
                        where: { id: matchedRule.id },
                        data: { matchCount: { increment: 1 } },
                    });

                    // AUTO-APRENDIZAJE: Registrar esta glosa como nuevo alias en la memoria
                    if (descNorm && descNorm.length >= 4) {
                        try {
                            await this.prisma.glosaCategoryAlias.upsert({
                                where: {
                                    ruleId_glosaNormalized: {
                                        ruleId: matchedRule.id,
                                        glosaNormalized: descNorm,
                                    },
                                },
                                update: {
                                    timesMatched: { increment: 1 },
                                    lastSeenAt: new Date(),
                                },
                                create: {
                                    ruleId: matchedRule.id,
                                    glosaBancaria: tx.description,
                                    glosaNormalized: descNorm,
                                    source: 'AUTO_DETECTED',
                                    timesMatched: 1,
                                },
                            });
                        } catch { /* silenciar si falla el upsert */ }
                    }

                    this.logger.log(`Auto-categorized TX ${tx.id} (${tx.description}) using rule "${matchedRule.categoryName}"`);
                    categorizedCount++;
                    continue;
                }

                // IVA del banco (uso internacional, etc.). No mezclar con IVA COM. REMUNERACION.
                if (/\bIVA\b/i.test(tx.description || '') && !/REMUNERACION/i.test(tx.description || '')) {
                    await this.prisma.bankTransaction.update({
                        where: { id: tx.id },
                        data: {
                            status: TransactionStatus.MATCHED,
                            metadata: {
                                ...(typeof tx.metadata === 'object' && tx.metadata ? tx.metadata : {}),
                                reviewNote: '[Auto: IVA]',
                                autoCategorized: true,
                                category: 'IVA',
                                ruleName: 'IVA',
                            },
                        },
                    });
                    this.logger.log(`Auto-categorized TX ${tx.id} as IVA: ${tx.description}`);
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

    /**
     * Normaliza una glosa bancaria para búsqueda en el índice de aliases.
     * Misma lógica que ExcelPatternLearnerService.normalizeGlosa.
     */
    private normalizeGlosaForSearch(desc: string): string {
        return desc
            .toLowerCase()
            .replace(/\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]/gi, '')
            .replace(/[\d.,]+/g, ' ')
            .replace(/[^\w\sáéíóúñü]/g, ' ')
            .replace(/\b(a|de|del|el|la|los|las|en|por|con|nro|num|n)\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
}
