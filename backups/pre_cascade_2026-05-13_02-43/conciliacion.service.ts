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
        this.logger.log('Starting Reconciliation Cycle (Optimized)...');

        // Solo los CONFIRMED bloquean; consideramos PENDING y PARTIALLY_MATCHED (DRAFT) para re-buscar la mejor opción
        const whereClause: any = {
            status: { in: [TransactionStatus.PENDING, TransactionStatus.PARTIALLY_MATCHED] },
            type: TransactionType.DEBIT // Excluir Abonos para no matchearlos con facturas
        };
        
        if (organizationId) {
            whereClause.bankAccount = { organizationId };
        }
        const minDate = this.visibility.applyMinDate(
            fromDate ? new Date(fromDate) : undefined,
        );
        if (minDate || toDate) {
            whereClause.date = {};
            if (minDate) whereClause.date.gte = minDate;
            if (toDate) whereClause.date.lte = new Date(toDate);
        }

        // Incluir DTEs desde N días antes del inicio del período (ej. movimientos ene 2026 pueden matchear facturas nov/dic 2025)
        const lookbackRaw = process.env.MATCH_DTE_LOOKBACK_DAYS;
        const dteLookbackDays = lookbackRaw && Number(lookbackRaw) >= 0 ? Number(lookbackRaw) : 90;
        const dteMinDate = minDate
            ? new Date(minDate.getTime() - dteLookbackDays * 24 * 60 * 60 * 1000)
            : undefined;

        try {
            // 1. Fetch EVERYTHING needed once to avoid N+1 queries
            this.fileLog('FETCHING: Transactions, DTEs and Payments...');
            const [pendingTransactions, allUnpaidDtes, allRecentPayments] = await Promise.all([
                this.prisma.bankTransaction.findMany({
                    where: whereClause,
                    orderBy: { date: 'asc' },
                    include: { bankAccount: { select: { bankName: true, accountNumber: true, organizationId: true } } },
                }),
                this.prisma.dTE.findMany({
                    where: {
                        paymentStatus: 'UNPAID',
                        ...(organizationId && { provider: { organizationId } }),
                        ...(dteMinDate && { issuedDate: { gte: dteMinDate } }),
                    },
                    include: { provider: { select: { name: true } } }
                }),
                this.prisma.payment.findMany({
                    where: {
                        ...(organizationId && { provider: { organizationId } }),
                        paymentDate: {
                            gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
                        }
                    }
                })
            ]);

            const byAccount = new Map<string, number>();
            for (const tx of pendingTransactions) {
                const key = `${tx.bankAccount?.bankName ?? '?'} - ${tx.bankAccount?.accountNumber ?? '?'}`;
                byAccount.set(key, (byAccount.get(key) ?? 0) + 1);
            }
            this.fileLog(`FOUND: ${pendingTransactions.length} pending tx, ${allUnpaidDtes.length} unpaid DTEs, ${allRecentPayments.length} payments.`);
            this.fileLog(`BY ACCOUNT: ${[...byAccount.entries()].map(([k, n]) => `${k}=${n}`).join(', ')}`);

            // Quitar DRAFT previos para que el motor vuelva a asignar la mejor opción (solo CONFIRMED bloquean)
            const txIds = pendingTransactions.map((t) => t.id);
            const deletedDraft = await this.prisma.reconciliationMatch.deleteMany({
                where: {
                    transactionId: { in: txIds },
                    status: MatchStatus.DRAFT,
                },
            });
            if (deletedDraft.count > 0) {
                this.fileLog(`CLEARED ${deletedDraft.count} DRAFT matches to re-run best assignment.`);
            }

            const usedDteIds = new Set<string>();
            const usedTxIds = new Set<string>();
            const usedPaymentIds = new Set<string>();
            let matchCount = 0;

            // === 1.5 Auto-Amortizar Notas de Crédito (NC) contra Facturas de igual monto ===
            this.fileLog('AUTO-AMORTIZING: 1:1 Credit Notes against Invoices...');
            
            // Consultar Notas de Crédito (tipo 61) directamente para traer también las que estén 'PAID'
            const creditNotes = await this.prisma.dTE.findMany({
                where: {
                    type: 61,
                    ...(organizationId && { provider: { organizationId } }),
                    ...(dteMinDate && { issuedDate: { gte: dteMinDate } }),
                }
            });
            const invoices = allUnpaidDtes.filter(d => d.type !== 61);

            for (const cn of creditNotes) {
                const match = invoices.find(inv => 
                    inv.providerId === cn.providerId && 
                    inv.totalAmount === cn.totalAmount && 
                    !usedDteIds.has(inv.id)
                );
                if (match) {
                    await this.prisma.$transaction(async (prisma) => {
                        await prisma.dTE.update({
                            where: { id: match.id },
                            data: { 
                                paymentStatus: 'PAID', 
                                outstandingAmount: 0,
                                metadata: {
                                    ...(match.metadata as any || {}),
                                    reconciliationComment: `Neteado contra NC ${cn.folio}`
                                }
                            }
                        });
                        // Asegurar que ambas estén PAID
                        await prisma.dTE.update({
                            where: { id: cn.id },
                            data: { 
                                paymentStatus: 'PAID', 
                                outstandingAmount: 0,
                                metadata: {
                                    ...(cn.metadata as any || {}),
                                    reconciliationComment: `Amortizado contra Factura ${match.folio}`
                                }
                            }
                        });
                    });
                    usedDteIds.add(match.id);
                    usedDteIds.add(cn.id);
                    this.fileLog(`NC AUTONULLED: NC ${cn.folio} nulled Invoice ${match.folio} (Amt: ${cn.totalAmount})`);
                }
            }

            // Recolectar todos los pares (TX, DTE) candidatos con diferencia de días para priorizar por fecha cercana
            type Pair = { tx: BankTransaction; dte: DTE & { provider?: { name: string } | null }; score: number; reason: string; strategyName: string; dateDiffDays: number };
            const allPairs: Pair[] = [];
            for (const tx of pendingTransactions) {
                const result = await this.getBestCandidatesForTransaction(tx, allRecentPayments, allUnpaidDtes);
                if (!result || result.candidates.length === 0) continue;
                const strategyName = result.strategyName;
                for (const c of result.candidates) {
                    if (!c.dte) continue;
                    const dateDiffDays = Math.abs(Math.round((new Date(tx.date).getTime() - new Date(c.dte.issuedDate).getTime()) / 86400000));
                    allPairs.push({
                        tx,
                        dte: c.dte,
                        score: c.score,
                        reason: c.reason,
                        strategyName,
                        dateDiffDays,
                    });
                }
            }

            // Ordenar por proximidad de fecha (menor dateDiff primero) y luego por score descendente
            allPairs.sort((a, b) => {
                if (a.dateDiffDays !== b.dateDiffDays) return a.dateDiffDays - b.dateDiffDays;
                return b.score - a.score;
            });

            // Asignar en ese orden: el par más cercano en fecha tiene prioridad (no bloquea un match mejor)
            // Todos los matches quedan en DRAFT hasta confirmación manual del usuario
            for (const pair of allPairs) {
                if (usedTxIds.has(pair.tx.id) || usedDteIds.has(pair.dte.id)) continue;
                const candidate = { dte: pair.dte, score: pair.score, reason: pair.reason };
                if (pair.score >= 0.55) {
                    await this.createMatch(pair.tx, candidate, pair.strategyName, MatchStatus.DRAFT);
                    matchCount++;
                    usedTxIds.add(pair.tx.id);
                    usedDteIds.add(pair.dte.id);
                    this.fileLog(`DRAFT (${pair.dateDiffDays}d): ${pair.tx.description} | ${pair.tx.amount} -> ${pair.reason}`);
                }
            }

            // Segunda pasada: matches contra Payment (1:1, sin conflicto de “quién se queda el DTE”)
            for (const tx of pendingTransactions) {
                if (usedTxIds.has(tx.id)) continue;
                const currentDtes = allUnpaidDtes.filter(d => !usedDteIds.has(d.id));
                const result = await this.tryMatchTransaction(tx, allRecentPayments, currentDtes);
                if (result) {
                    this.fileLog(`MATCH (2ª pasada): ${tx.description} | ${tx.amount} -> ${result.reason}`);
                    matchCount++;
                    usedTxIds.add(tx.id);
                    if (result.dteId) usedDteIds.add(result.dteId);
                    if (result.paymentId) usedPaymentIds.add(result.paymentId);
                }
            }

            // === Segunda pasada: SumMatchStrategy (N:1) === (mismo rango de fechas que la primera, con visibility)
            let suggestionsCount = 0;
            let sumAutoConfirmed = 0;
            try {
                const sumWhere: any = {
                    status: { in: [TransactionStatus.PENDING, TransactionStatus.PARTIALLY_MATCHED] },
                    type: TransactionType.DEBIT
                };
                if (organizationId) sumWhere.bankAccount = { organizationId };
                if (minDate || toDate) {
                    sumWhere.date = {};
                    if (minDate) sumWhere.date.gte = minDate;
                    if (toDate) sumWhere.date.lte = new Date(toDate);
                }
                const remainingTx = await this.prisma.bankTransaction.findMany({
                    where: sumWhere,
                });
                const remainingDtes = await this.prisma.dTE.findMany({
                    where: {
                        paymentStatus: 'UNPAID',
                        ...(organizationId && { provider: { organizationId } }),
                    },
                    include: { provider: { select: { name: true } } },
                });
                const suggestions = await this.sumMatchStrategy.findSumSuggestions(remainingTx, remainingDtes);
                const sumResult = await this.sumMatchStrategy.persistSuggestions(suggestions, organizationId);
                suggestionsCount = sumResult.suggestions;
                sumAutoConfirmed = sumResult.autoConfirmed;
                this.fileLog(`SUM MATCH: ${sumAutoConfirmed} auto-confirmed, ${suggestionsCount} suggestions created.`);
            } catch (sumErr) {
                this.fileLog(`SUM STRATEGY ERROR: ${sumErr.message}`);
                this.logger.warn(`SumMatchStrategy error: ${sumErr.message}`);
            }

            // === Tercera pasada: SplitPaymentMatch (1:N) === (mismo rango de fechas)
            let splitSuggestions = 0;
            let splitAutoConfirmed = 0;
            try {
                const splitWhere: any = {
                    status: { in: [TransactionStatus.PENDING, TransactionStatus.PARTIALLY_MATCHED] },
                    type: TransactionType.DEBIT
                };
                if (organizationId) splitWhere.bankAccount = { organizationId };
                if (minDate || toDate) {
                    splitWhere.date = {};
                    if (minDate) splitWhere.date.gte = minDate;
                    if (toDate) splitWhere.date.lte = new Date(toDate);
                }
                const remainingTx2 = await this.prisma.bankTransaction.findMany({
                    where: splitWhere,
                });
                const remainingDtes2 = await this.prisma.dTE.findMany({
                    where: {
                        paymentStatus: 'UNPAID',
                        ...(organizationId && { provider: { organizationId } }),
                    },
                    include: { provider: { select: { name: true } } },
                });
                const splits = await this.splitPaymentStrategy.findSplitPaymentSuggestions(remainingTx2, remainingDtes2);
                const splitResult = await this.splitPaymentStrategy.persistSuggestions(splits, organizationId);
                splitSuggestions = splitResult.suggestions;
                splitAutoConfirmed = splitResult.autoConfirmed;
                this.fileLog(`SPLIT PAYMENT: ${splitAutoConfirmed} auto-confirmed, ${splitSuggestions} suggestions created.`);
            } catch (splitErr) {
                this.fileLog(`SPLIT STRATEGY ERROR: ${splitErr.message}`);
                this.logger.warn(`SplitPaymentMatchStrategy error: ${splitErr.message}`);
            }

            // === Cuarta pasada (Opcional): Auto-Categorización de Gastos Fijos ===
            const rulesResult = await this.rulesEngine.executeAutoCategoryRules(organizationId);
            if (rulesResult.categorized > 0) {
                this.fileLog(`AUTO-CATEGORIZED: ${rulesResult.categorized} pending transactions via rule engine.`);
            }

            const totalAutoMatches = matchCount + sumAutoConfirmed + splitAutoConfirmed;
            const totalSuggestions = suggestionsCount + splitSuggestions;
            this.fileLog(`COMPLETED: ${totalAutoMatches} total auto-matches, ${totalSuggestions} suggestions. Auto-Categorized: ${rulesResult.categorized}`);
            return {
                processed: pendingTransactions.length,
                matches: totalAutoMatches,
                suggestions: totalSuggestions,
                autoCategorized: rulesResult.categorized,
                detail: { exact: matchCount, sumAuto: sumAutoConfirmed, splitAuto: splitAutoConfirmed, sumSuggestions: suggestionsCount, splitSuggestions },
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
