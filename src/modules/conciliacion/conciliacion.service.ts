import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
    BankTransaction,
    MatchStatus,
    ReconciliationMatch,
    TransactionStatus
} from '@prisma/client';
import { ExactMatchStrategy } from './strategies/exact-match.strategy';
import { ApproximateMatchStrategy } from './strategies/approximate-match.strategy';
import { MatchingStrategy } from './domain/matching.interfaces';

@Injectable()
export class ConciliacionService {
    private readonly logger = new Logger(ConciliacionService.name);
    private strategies: MatchingStrategy[];

    constructor(
        private prisma: PrismaService,
        private exactStrategy: ExactMatchStrategy,
        private approxStrategy: ApproximateMatchStrategy,
    ) {
        // Priority Order: Exact first, then Approximate
        this.strategies = [this.exactStrategy, this.approxStrategy];
    }

    /**
     * Main entry point to run the reconciliation engine.
     * Processes all PENDING bank transactions.
     */
    async runReconciliationCycle(fromDate?: string, toDate?: string) {
        this.logger.log('Starting Reconciliation Cycle...');

        const whereClause: any = { status: TransactionStatus.PENDING };

        if (fromDate && toDate) {
            whereClause.date = {
                gte: new Date(fromDate),
                lte: new Date(toDate)
            };
        }

        // 1. Fetch pending transactions
        const pendingTransactions = await this.prisma.bankTransaction.findMany({
            where: whereClause,
            orderBy: { date: 'asc' },
        });

        this.logger.log(`Found ${pendingTransactions.length} pending transactions.`);
        let matchCount = 0;

        for (const tx of pendingTransactions) {
            const matchFound = await this.processTransaction(tx);
            if (matchFound) matchCount++;
        }

        this.logger.log(`Cycle completed. Created ${matchCount} matches.`);
        return { processed: pendingTransactions.length, matches: matchCount };
    }

    async getIngestedFiles() {
        // Fetch minimal data to group by file
        const txs = await this.prisma.bankTransaction.findMany({
            where: { origin: 'N8N_AUTOMATION' },
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
            if (tx.status === 'PENDING') g.pendingCount++;
        }

        return Object.values(groups);
    }

    async getOverview(limit = 100, filename?: string) {
        const where: any = {};

        if (filename) {
            // Prisma JSON filtering:
            where.metadata = {
                path: ['sourceFile'],
                equals: filename
            };
        }

        return this.prisma.bankTransaction.findMany({
            where,
            take: limit,
            orderBy: { date: 'desc' },
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

    private async processTransaction(tx: BankTransaction): Promise<boolean> {
        // 2. Fetch relevant candidates (Optimization: Search window of +/- 120 days ~4 months)
        // User reports payments can be delayed by "months".
        const searchWindowDays = 120;
        const dateStart = new Date(tx.date);
        dateStart.setDate(dateStart.getDate() - searchWindowDays);
        const dateEnd = new Date(tx.date);
        dateEnd.setDate(dateEnd.getDate() + searchWindowDays);

        const [payments, dtes] = await Promise.all([
            this.prisma.payment.findMany({
                where: {
                    paymentDate: { gte: dateStart, lte: dateEnd },
                    // OPTIONAL: status: { not: 'RECONCILED' } if we tracked that on Payment
                    // For now, we assume we check against all, but ideally we filter out already fully matched ones.
                    // Since Payment -> Match is 1:N? No, Match -> Payment is N:1.
                },
            }),
            this.prisma.dTE.findMany({
                where: {
                    issuedDate: { gte: dateStart, lte: dateEnd },
                },
            }),
        ]);

        // 3. Apply Strategies
        for (const strategy of this.strategies) {
            const result = await strategy.findMatches(tx, payments, dtes);

            if (result && result.candidates.length > 0) {
                // Take the best candidate (highest score)
                const bestCandidate = result.candidates[0]; // Assumes strategy sorted them

                await this.createMatch(tx, bestCandidate, strategy.name);
                return true; // Stop after first successful strategy match
            }
        }

        return false;
    }

    private async createMatch(
        tx: BankTransaction,
        candidate: { payment?: any; dte?: any; score: number; reason: string },
        strategyName: string
    ) {
        // Determine Status based on Score
        let status: MatchStatus = MatchStatus.DRAFT;
        if (candidate.score === 1.0) {
            status = MatchStatus.CONFIRMED;
        }

        // DB Transaction to ensure consistency
        await this.prisma.$transaction(async (prisma) => {
            // 1. Create the Match Record
            await prisma.reconciliationMatch.create({
                data: {
                    transactionId: tx.id,
                    paymentId: candidate.payment?.id,
                    dteId: candidate.dte?.id,
                    origin: 'AUTOMATIC',
                    status: status,
                    confidence: candidate.score,
                    ruleApplied: strategyName + ` - ${candidate.reason}`,
                },
            });

            // 2. Update Transaction Status
            if (status === MatchStatus.CONFIRMED) {
                await prisma.bankTransaction.update({
                    where: { id: tx.id },
                    data: { status: TransactionStatus.MATCHED },
                });
            }
        });

        this.logger.log(`Match created for Tx ${tx.id} with Score ${candidate.score} (${status})`);
    }

    async cleanAllMatches() {
        this.logger.warn('⚠️ CLEANING ALL RECONCILIATION MATCHES');

        // Delete all matches
        const result = await this.prisma.reconciliationMatch.deleteMany({});

        // Reset all transaction statuses to PENDING
        const updated = await this.prisma.bankTransaction.updateMany({
            data: { status: TransactionStatus.PENDING }
        });

        return {
            deletedMatches: result.count,
            transactionsReset: updated.count,
            message: 'All matches deleted and transactions reset to PENDING'
        };
    }
}
