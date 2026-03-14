import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BankTransaction, DTE } from '@prisma/client';
import {
    providerMatchesDescription,
    isWithinDateWindow,
} from '../utils/provider-matcher';

export interface SplitPaymentSuggestion {
    transaction: BankTransaction;
    dtes: (DTE & { provider?: { name: string } | null })[];
    totalAmount: number;
    confidence: number;
    reason: string;
}

@Injectable()
export class SplitPaymentMatchStrategy {
    private readonly logger = new Logger(SplitPaymentMatchStrategy.name);
    private readonly amountToleranceClp: number;
    private readonly dateWindowDays: number;
    private readonly maxDtes = 5;

    constructor(private prisma: PrismaService) {
        const raw = process.env.MATCH_AMOUNT_TOLERANCE_CLP;
        const parsed = raw ? Number.parseInt(raw, 10) : NaN;
        this.amountToleranceClp = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;

        const windowRaw = process.env.MATCH_DATE_WINDOW_DAYS;
        const windowParsed = windowRaw ? Number.parseInt(windowRaw, 10) : NaN;
        this.dateWindowDays = Number.isFinite(windowParsed) && windowParsed >= 0 ? windowParsed : 60;
    }

    async findSplitPaymentSuggestions(
        pendingTransactions: BankTransaction[],
        unpaidDtes: (DTE & { provider?: { name: string } | null })[],
    ): Promise<SplitPaymentSuggestion[]> {
        const suggestions: SplitPaymentSuggestion[] = [];
        const usedDteIds = new Set<string>();

        const dtesByProvider = new Map<string, (DTE & { provider?: { name: string } | null })[]>();
        for (const dte of unpaidDtes) {
            const key = dte.providerId || 'UNKNOWN';
            if (!dtesByProvider.has(key)) dtesByProvider.set(key, []);
            dtesByProvider.get(key)!.push(dte);
        }

        const sortedTxs = [...pendingTransactions].sort(
            (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
        );

        for (const tx of sortedTxs) {
            const txAbs = Math.abs(tx.amount);
            if (txAbs < 50000) continue;

            for (const [providerId, providerDtes] of dtesByProvider.entries()) {
                if (providerId === 'UNKNOWN') continue;

                const provName = providerDtes[0]?.provider?.name;
                if (!provName) continue;

                if (!providerMatchesDescription(tx.description || '', provName, providerDtes[0])) {
                    continue;
                }

                const candidateDtes = providerDtes.filter(
                    (d) =>
                        !usedDteIds.has(d.id) &&
                        Math.abs(d.totalAmount) < txAbs &&
                        isWithinDateWindow(tx.date, d.issuedDate, this.dateWindowDays),
                );

                if (candidateDtes.length < 2) continue;

                const sorted = candidateDtes
                    .map((d) => ({ dte: d, abs: Math.abs(d.totalAmount) }))
                    .sort((a, b) => b.abs - a.abs);

                const combo = this.findCombination(
                    sorted.map((s) => s.abs),
                    txAbs,
                    this.amountToleranceClp,
                    Math.min(this.maxDtes, sorted.length),
                );

                if (!combo) continue;

                const selectedDtes = combo.map((idx) => sorted[idx].dte);
                const total = combo.reduce((sum, idx) => sum + sorted[idx].abs, 0);
                const diff = Math.abs(total - txAbs);
                const confidence = diff === 0 ? 0.95 : 0.80;

                for (const d of selectedDtes) usedDteIds.add(d.id);

                suggestions.push({
                    transaction: tx,
                    dtes: selectedDtes,
                    totalAmount: total,
                    confidence,
                    reason: `1 TX ($${txAbs.toLocaleString('es-CL')}) = ${selectedDtes.length} DTEs de ${provName} (suma: $${total.toLocaleString('es-CL')}, dif: $${diff})`,
                });

                break;
            }
        }

        return suggestions;
    }

    async persistSuggestions(
        suggestions: SplitPaymentSuggestion[],
    ): Promise<{ suggestions: number; autoConfirmed: number }> {
        let suggestionCount = 0;
        let autoConfirmed = 0;

        for (const s of suggestions) {
            // Todos los matches requieren confirmación manual; no auto-confirmar
            const existing = await this.prisma.matchSuggestion.findFirst({
                where: {
                    dteId: s.dtes[0].id,
                    type: 'SPLIT',
                    status: 'PENDING',
                },
            });
            if (existing) continue;

            const allDteIds = s.dtes.map((d) => d.id);
            await this.prisma.matchSuggestion.create({
                data: {
                    type: 'SPLIT',
                    dteId: s.dtes[0].id,
                    transactionIds: [s.transaction.id],
                    relatedDteIds: allDteIds,
                    totalAmount: s.totalAmount,
                    confidence: s.confidence,
                    reason: s.reason,
                    status: 'PENDING',
                },
            });
            suggestionCount++;
        }
        return { suggestions: suggestionCount, autoConfirmed };
    }

    private async autoConfirmSplitPayment(s: SplitPaymentSuggestion): Promise<void> {
        await this.prisma.$transaction(async (prisma) => {
            const freshTx = await prisma.bankTransaction.findUnique({
                where: { id: s.transaction.id },
                select: { status: true },
            });
            if (freshTx?.status === 'MATCHED') return;

            for (const dte of s.dtes) {
                await prisma.reconciliationMatch.create({
                    data: {
                        transactionId: s.transaction.id,
                        dteId: dte.id,
                        origin: 'AUTOMATIC',
                        status: 'CONFIRMED',
                        confidence: s.confidence,
                        ruleApplied: `SplitPayment (auto) - ${s.reason}`,
                    },
                });

                await prisma.dTE.update({
                    where: { id: dte.id },
                    data: { paymentStatus: 'PAID', outstandingAmount: 0 },
                });
            }

            await prisma.bankTransaction.update({
                where: { id: s.transaction.id },
                data: { status: 'MATCHED' },
            });
        });
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
}
