import { Injectable } from '@nestjs/common';
import { BankTransaction, Payment, DTE } from '@prisma/client';
import { MatchingStrategy, MatchCandidate } from '../domain/matching.interfaces';
import {
    normalizeProviderName,
    providerMatchesDescription,
    isWithinDateWindow,
} from '../utils/provider-matcher';

type DteWithProvider = DTE & { provider?: { name: string } | null };

/**
 * ExactMatch: High-confidence 1:1 matching.
 *
 * Requires amount match + provider match + date window.
 * When multiple DTEs qualify, ranks by date proximity to pick the best.
 */
@Injectable()
export class ExactMatchStrategy implements MatchingStrategy {
    public name = 'ExactMatch';
    private readonly amountToleranceClp: number;
    private readonly dateWindowDays: number;

    constructor() {
        const raw = process.env.MATCH_AMOUNT_TOLERANCE_CLP;
        const parsed = raw ? Number.parseInt(raw, 10) : NaN;
        this.amountToleranceClp = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;

        const windowRaw = process.env.MATCH_DATE_WINDOW_DAYS;
        const windowParsed = windowRaw ? Number.parseInt(windowRaw, 10) : NaN;
        this.dateWindowDays = Number.isFinite(windowParsed) && windowParsed >= 0 ? windowParsed : 120;
    }

    /** @deprecated Use the standalone function from utils/provider-matcher instead */
    static normalizeProviderName(name: string): string {
        return normalizeProviderName(name);
    }

    async findMatches(
        transaction: BankTransaction,
        payments: Payment[],
        dtes: DteWithProvider[],
    ): Promise<MatchCandidate | null> {
        const candidates: MatchCandidate['candidates'] = [];
        const txDate = new Date(transaction.date).getTime();

        for (const payment of payments) {
            const diff = this.amountDiff(transaction.amount, payment.amount);
            if (
                this.isSameAmount(transaction.amount, payment.amount) &&
                isWithinDateWindow(transaction.date, payment.paymentDate, this.dateWindowDays)
            ) {
                const daysDiff = Math.abs(txDate - new Date(payment.paymentDate).getTime()) / 86400000;
                candidates.push({
                    payment,
                    score: this.computeScore(diff, daysDiff, true),
                    reason: diff === 0
                        ? `Monto exacto + Pago a ${Math.round(daysDiff)}d`
                        : `Monto ±$${diff} + Pago a ${Math.round(daysDiff)}d`,
                });
            }
        }

        for (const dte of dtes) {
            const diff = this.amountDiff(transaction.amount, dte.totalAmount);
            if (!this.isSameAmount(transaction.amount, dte.totalAmount)) continue;
            if (!isWithinDateWindow(transaction.date, dte.issuedDate, this.dateWindowDays)) continue;
            if (!providerMatchesDescription(transaction.description || '', dte.provider?.name, dte)) continue;

            const daysDiff = Math.abs(txDate - new Date(dte.issuedDate).getTime()) / 86400000;
            candidates.push({
                dte,
                score: this.computeScore(diff, daysDiff, true),
                reason: diff === 0
                    ? `Monto exacto + Empresa ${dte.provider?.name || dte.rutIssuer} a ${Math.round(daysDiff)}d`
                    : `Monto ±$${diff} + Empresa ${dte.provider?.name || dte.rutIssuer} a ${Math.round(daysDiff)}d`,
            });
        }

        if (candidates.length === 0) return null;

        candidates.sort((a, b) => b.score - a.score);
        return { transaction, candidates };
    }

    private computeScore(amountDiff: number, daysDiff: number, providerMatch: boolean): number {
        let amountScore = amountDiff === 0 ? 1.0 : Math.max(0, 1.0 - amountDiff / this.amountToleranceClp);
        let dateScore = daysDiff <= 3 ? 1.0
            : daysDiff <= 10 ? 0.90
            : daysDiff <= 20 ? 0.80
            : daysDiff <= 35 ? 0.70
            : daysDiff <= 60 ? 0.50
            : daysDiff <= 90 ? 0.30
            : daysDiff <= 120 ? 0.10
            : 0; // Fuera de ventana
        let provScore = providerMatch ? 1.0 : 0.0;

        return Math.round((amountScore * 0.30 + dateScore * 0.45 + provScore * 0.25) * 100) / 100;
    }

    private isSameAmount(a: number, b: number): boolean {
        return this.amountDiff(a, b) <= this.amountToleranceClp;
    }

    private amountDiff(a: number, b: number): number {
        return Math.abs(Math.abs(a) - Math.abs(b));
    }
}
