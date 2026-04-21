import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BankTransaction, DTE, TransactionStatus } from '@prisma/client';
import {
    providerMatchesDescription,
    isWithinDateWindow,
} from '../utils/provider-matcher';

export interface SumSuggestion {
    dte: DTE & { provider?: { name: string } | null };
    transactions: BankTransaction[];
    totalAmount: number;
    confidence: number;
    reason: string;
}

@Injectable()
export class SumMatchStrategy {
    private readonly logger = new Logger(SumMatchStrategy.name);
    private readonly amountToleranceClp: number;
    private readonly dateWindowDays: number;
    private readonly maxTransactions = 5;

    constructor(private prisma: PrismaService) {
        const raw = process.env.MATCH_AMOUNT_TOLERANCE_CLP;
        const parsed = raw ? Number.parseInt(raw, 10) : NaN;
        this.amountToleranceClp = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;

        const windowRaw = process.env.MATCH_DATE_WINDOW_DAYS;
        const windowParsed = windowRaw ? Number.parseInt(windowRaw, 10) : NaN;
        this.dateWindowDays = Number.isFinite(windowParsed) && windowParsed >= 0 ? windowParsed : 60;
    }

    async findSumSuggestions(
        pendingTransactions: BankTransaction[],
        unpaidDtes: (DTE & { provider?: { name: string } | null })[],
    ): Promise<SumSuggestion[]> {
        const suggestions: SumSuggestion[] = [];
        const usedTxIds = new Set<string>();

        for (const dte of unpaidDtes) {
            const provName = dte.provider?.name;
            if (!provName) continue;

            const matchingTxs = pendingTransactions.filter(
                (tx) =>
                    !usedTxIds.has(tx.id) &&
                    providerMatchesDescription(tx.description || '', provName, dte as any, (tx.metadata as any)?.providerRut) &&
                    isWithinDateWindow(tx.date, dte.issuedDate, this.dateWindowDays) &&
                    Math.abs(tx.amount) < Math.abs(dte.totalAmount),
            );

            if (matchingTxs.length < 2) continue;

            const sorted = matchingTxs
                .map((tx) => ({ tx, absAmt: Math.abs(tx.amount) }))
                .sort((a, b) => b.absAmt - a.absAmt);

            const combo = this.findCombination(
                sorted.map((t) => t.absAmt),
                Math.abs(dte.totalAmount),
                this.amountToleranceClp,
                this.maxTransactions,
            );

            if (!combo) continue;

            const selectedTxs = combo.map((idx) => sorted[idx].tx);
            const total = combo.reduce((sum, idx) => sum + sorted[idx].absAmt, 0);
            const diff = Math.abs(total - Math.abs(dte.totalAmount));
            const confidence = diff === 0 ? 0.9 : 0.75;

            for (const tx of selectedTxs) usedTxIds.add(tx.id);

            suggestions.push({
                dte,
                transactions: selectedTxs,
                totalAmount: total,
                confidence,
                reason: `${selectedTxs.length} transacciones suman $${total.toLocaleString('es-CL')} ≈ DTE $${Math.abs(dte.totalAmount).toLocaleString('es-CL')} (dif: $${diff})`,
            });
        }

        return suggestions;
    }

    private findCombination(
        amounts: number[],
        target: number,
        tolerance: number,
        maxLen: number,
    ): number[] | null {
        const n = amounts.length;
        const limit = Math.min(n, maxLen);

        const search = (
            start: number,
            chosen: number[],
            currentSum: number,
        ): number[] | null => {
            if (chosen.length >= 2 && Math.abs(currentSum - target) <= tolerance) {
                return [...chosen];
            }
            if (chosen.length >= limit || currentSum > target + tolerance) return null;

            for (let i = start; i < n; i++) {
                chosen.push(i);
                const result = search(i + 1, chosen, currentSum + amounts[i]);
                if (result) return result;
                chosen.pop();
            }
            return null;
        };

        return search(0, [], 0);
    }

    async persistSuggestions(suggestions: SumSuggestion[], organizationId?: string): Promise<{ suggestions: number; autoConfirmed: number }> {
        let suggestionCount = 0;
        let autoConfirmed = 0;

        for (const s of suggestions) {
            // Todos los matches requieren confirmación manual; no auto-confirmar
            const existing = await this.prisma.matchSuggestion.findFirst({
                where: { dteId: s.dte.id, type: 'SUM', status: 'PENDING' },
            });
            if (existing) continue;

            await this.prisma.matchSuggestion.create({
                data: {
                    type: 'SUM',
                    dteId: s.dte.id,
                    transactionIds: s.transactions.map((tx) => tx.id),
                    totalAmount: s.totalAmount,
                    confidence: s.confidence,
                    reason: s.reason,
                    status: 'PENDING',
                    organizationId: organizationId || s.dte.organizationId,
                },
            });
            suggestionCount++;
        }
        return { suggestions: suggestionCount, autoConfirmed };
    }

    private async autoConfirmSumMatch(s: SumSuggestion, organizationId?: string): Promise<void> {
        await this.prisma.$transaction(async (prisma) => {
            for (const tx of s.transactions) {
                const freshTx = await prisma.bankTransaction.findUnique({
                    where: { id: tx.id },
                    select: { status: true },
                });
                if (freshTx?.status === 'MATCHED') continue;

                await prisma.reconciliationMatch.create({
                    data: {
                        transactionId: tx.id,
                        dteId: s.dte.id,
                        origin: 'AUTOMATIC',
                        status: 'CONFIRMED',
                        confidence: s.confidence,
                        ruleApplied: `SumMatch (auto) - ${s.reason}`,
                        organizationId: organizationId || s.dte.organizationId,
                    },
                });

                await prisma.bankTransaction.update({
                    where: { id: tx.id },
                    data: { status: 'MATCHED' },
                });
            }

            await prisma.dTE.update({
                where: { id: s.dte.id },
                data: { paymentStatus: 'PAID', outstandingAmount: 0 },
            });
        });
    }
}
