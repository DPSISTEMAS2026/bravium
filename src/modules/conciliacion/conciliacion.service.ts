import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataVisibilityService } from '../../common/services/data-visibility.service';
import {
    BankTransaction,
    MatchStatus,
    ReconciliationMatch,
    TransactionStatus,
    Payment,
    DTE,
    TransactionType
} from '@prisma/client';
import * as fs from 'fs';
import { ExactMatchStrategy } from './strategies/exact-match.strategy';
import { AmountMatchStrategy } from './strategies/amount-match.strategy';
import { SumMatchStrategy } from './strategies/sum-match.strategy';
import { SplitPaymentMatchStrategy } from './strategies/split-payment-match.strategy';
import { MatchingStrategy } from './domain/matching.interfaces';
import { RulesEngineService } from './services/rules-engine.service';
import { ReconciliationEngine } from './engine/reconciliation.engine';


@Injectable()
export class ConciliacionService {
    private readonly logger = new Logger(ConciliacionService.name);
    private strategies: MatchingStrategy[];
    private isRunning = false;

    constructor(
        private prisma: PrismaService,
        private exactStrategy: ExactMatchStrategy,
        private amountStrategy: AmountMatchStrategy,
        private sumMatchStrategy: SumMatchStrategy,
        private splitPaymentStrategy: SplitPaymentMatchStrategy,
        private readonly visibility: DataVisibilityService,
        private readonly rulesEngine: RulesEngineService,
    ) {
        this.strategies = [this.exactStrategy, this.amountStrategy];
    }

    private fileLog(msg: string) {
        try {
            fs.appendFileSync('d:/BRAVIUM-PRODUCCION/debug_recon.log', `[${new Date().toISOString()}] ${msg}\n`);
        } catch (err) { /* ignore */ }
    }

    /**
     * Main entry point to run the reconciliation engine.
     * Processes all PENDING bank transactions.
     */
    async runReconciliationCycle(fromDate?: string, toDate?: string, organizationId?: string) {
        if (this.isRunning) {
            this.fileLog('SKIPPING: Already running');
            this.logger.warn('Reconciliation cycle is already running. Skipping.');
            return { status: 'busy', message: 'Process already in progress' };
        }

        this.isRunning = true;
        this.fileLog(`STARTING: cycle for ${fromDate} to ${toDate}`);
        this.logger.log('Starting Reconciliation Cycle (Cascade Engine v2)...');

        try {
            // Resolver organización
            let resolvedOrgId = organizationId;
            if (!resolvedOrgId) {
                const org = await this.prisma.organization.findFirst({ where: { isActive: true } });
                if (!org) throw new Error('No se encontró organización activa.');
                resolvedOrgId = org.id;
            }

            // Calcular ventana de búsqueda desde fromDate
            const minDate = this.visibility.applyMinDate(fromDate ? new Date(fromDate) : undefined);

            // Motor canónico único
            const engine = new ReconciliationEngine(this.prisma);
            const result = await engine.run({
                organizationId: resolvedOrgId,
                dryRun: false,
            });

            // Auto-categorización complementaria por palabras clave
            const rulesResult = await this.rulesEngine.executeAutoCategoryRules(resolvedOrgId);
            if (rulesResult.categorized > 0) {
                this.fileLog(`AUTO-CATEGORIZED: ${rulesResult.categorized} via rules engine.`);
            }

            this.fileLog(
                `COMPLETED: P1=${result.pass1Exact} Drafts=${result.totalDrafts} Rules=${rulesResult.categorized}`
            );

            return {
                processed: result.processed,
                matches: result.totalDrafts + result.pass1Exact,
                suggestions: 0,
                autoCategorized: rulesResult.categorized,
                detail: result,
            };
        } catch (err) {
            this.fileLog(`ERROR: ${err.message}`);
            this.logger.error(`Cycle failed: ${err.message}`, err.stack);
            throw err;
        } finally {
            this.isRunning = false;
        }
    }


    async getIngestedFiles(organizationId?: string) {
        // Fetch minimal data to group by file
        const where: any = { origin: 'N8N_AUTOMATION' };
        if (organizationId) where.bankAccount = { organizationId };
        
        const txs = await this.prisma.bankTransaction.findMany({
            where,
            select: {
                id: true,
                date: true,
                status: true,
                amount: true,
                metadata: true,
                bankAccount: { select: { bankName: true } }
            },
            orderBy: { date: 'desc' }
        });

        // Group by sourceFile
        const groups: Record<string, any> = {};

        for (const tx of txs) {
            const meta = tx.metadata as any;
            const filename = meta?.sourceFile || 'Desconocido';

            if (!groups[filename]) {
                groups[filename] = {
                    filename,
                    bankName: tx.bankAccount.bankName,
                    count: 0,
                    minDate: tx.date,
                    maxDate: tx.date,
                    totalAmount: 0,
                    pendingCount: 0
                };
            }

            const g = groups[filename];
            g.count++;
            if (tx.date < g.minDate) g.minDate = tx.date;
            if (tx.date > g.maxDate) g.maxDate = tx.date;
            g.totalAmount += tx.amount;
            if (tx.status === 'PENDING' || tx.status === 'PARTIALLY_MATCHED') g.pendingCount++;
        }

        return Object.values(groups);
    }

    async getOverview(limit = 100, filename?: string, organizationId?: string) {
        const where: any = {};

        if (filename) {
            // Prisma JSON filtering:
            where.metadata = {
                path: ['sourceFile'],
                equals: filename
            };
        }
        
        if (organizationId) {
            where.bankAccount = { organizationId };
        }

        return this.prisma.bankTransaction.findMany({
            where,
            take: limit,
            orderBy: { date: 'asc' },
            include: {
                matches: {
                    include: {
                        dte: {
                            include: { provider: true }
                        },
                        payment: true
                    }
                }
            }
        });
    }

    private async tryMatchTransaction(
        tx: BankTransaction,
        payments: Payment[],
        dtes: (DTE & { provider?: { name: string } | null })[]
    ): Promise<{ dteId?: string, paymentId?: string, reason: string } | null> {
        for (const strategy of this.strategies) {
            const result = await strategy.findMatches(tx, payments, dtes);
            if (!result || result.candidates.length === 0) continue;

            const best = result.candidates[0];

            // Todos los matches requieren confirmación manual → siempre DRAFT
            if (best.score >= 0.55) {
                await this.createMatch(tx, best, strategy.name, MatchStatus.DRAFT);
                this.fileLog(`DRAFT: ${tx.description} | ${tx.amount} -> ${best.reason} (score: ${best.score})`);

                if (result.candidates.length > 1) {
                    await this.createSuggestionFromCandidates(tx, result.candidates.slice(1), strategy.name, (tx as any).bankAccount?.organizationId);
                }
                return {
                    dteId: best.dte?.id,
                    paymentId: best.payment?.id,
                    reason: `${strategy.name} [DRAFT]: ${best.reason}`
                };
            }
        }
        return null;
    }

    /**
     * Devuelve los candidatos (solo DTE) de la primera estrategia que encuentre algo.
     * No persiste ningún match; se usa para construir pares (TX, DTE) y ordenar por fecha.
     */
    private async getBestCandidatesForTransaction(
        tx: BankTransaction,
        payments: Payment[],
        dtes: (DTE & { provider?: { name: string } | null })[],
    ): Promise<{ candidates: { dte?: any; score: number; reason: string }[]; strategyName: string } | null> {
        for (const strategy of this.strategies) {
            const result = await strategy.findMatches(tx, payments, dtes);
            if (!result || result.candidates.length === 0) continue;
            const dteCandidates = result.candidates.filter(c => c.dte);
            if (dteCandidates.length === 0) continue;
            return { candidates: dteCandidates, strategyName: strategy.name };
        }
        return null;
    }

    private async createSuggestionFromCandidates(
        tx: BankTransaction,
        candidates: { payment?: any; dte?: any; score: number; reason: string }[],
        strategyName: string,
        organizationId?: string,
    ) {
        for (const candidate of candidates.slice(0, 5)) {
            if (!candidate.dte) continue;

            try {
                const existing = await this.prisma.matchSuggestion.findFirst({
                    where: {
                        dteId: candidate.dte.id,
                        transactionIds: { equals: [tx.id] },
                        status: 'PENDING',
                    }
                });
                if (existing) continue;

                await this.prisma.matchSuggestion.create({
                    data: {
                        type: 'SCORED',
                        dteId: candidate.dte.id,
                        transactionIds: [tx.id],
                        totalAmount: Math.abs(tx.amount),
                        confidence: candidate.score,
                        status: 'PENDING',
                        reason: `${strategyName}: ${candidate.reason}`,
                        organizationId,
                    }
                });
            } catch (err) {
                this.logger.warn(`Failed to create suggestion: ${err.message}`);
            }
        }
    }

    private async createMatch(
        tx: BankTransaction,
        candidate: { payment?: any; dte?: any; score: number; reason: string },
        strategyName: string,
        status: MatchStatus = MatchStatus.CONFIRMED,
    ) {
        await this.prisma.$transaction(async (prisma) => {
            const freshTx = await prisma.bankTransaction.findUnique({
                where: { id: tx.id },
                select: { status: true }
            });
            if (freshTx?.status === 'MATCHED') return;

            await prisma.reconciliationMatch.create({
                data: {
                    transactionId: tx.id,
                    paymentId: candidate.payment?.id,
                    dteId: candidate.dte?.id,
                    origin: 'AUTOMATIC',
                    status,
                    confidence: candidate.score,
                    ruleApplied: strategyName + ` - ${candidate.reason}`,
                    organizationId: (tx as any).bankAccount?.organizationId,
                },
            });

            if (status === MatchStatus.CONFIRMED) {
                await prisma.bankTransaction.update({
                    where: { id: tx.id },
                    data: { status: TransactionStatus.MATCHED },
                });

                if (candidate.dte) {
                    await prisma.dTE.update({
                        where: { id: candidate.dte.id },
                        data: { paymentStatus: 'PAID', outstandingAmount: 0 }
                    });
                }
            } else {
                await prisma.bankTransaction.update({
                    where: { id: tx.id },
                    data: { status: TransactionStatus.PARTIALLY_MATCHED },
                });
            }
        });

        this.logger.log(`Match ${status} for Tx ${tx.id} (score: ${candidate.score})`);
    }

    async cleanAllMatches(organizationId?: string) {
        this.logger.warn('⚠️ CLEANING ALL RECONCILIATION MATCHES' + (organizationId ? ` for org ${organizationId}` : ' (ALL ORGS!)'));

        const matchWhere: any = organizationId ? { organizationId } : {};
        const txWhere: any = organizationId ? { bankAccount: { organizationId } } : {};

        // Delete matches
        const result = await this.prisma.reconciliationMatch.deleteMany({ where: matchWhere });

        // Reset transaction statuses to PENDING
        const updated = await this.prisma.bankTransaction.updateMany({
            where: txWhere,
            data: { status: TransactionStatus.PENDING }
        });

        return {
            deletedMatches: result.count,
            transactionsReset: updated.count,
            message: 'Matches deleted and transactions reset to PENDING'
        };
    }
}
