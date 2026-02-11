import { Injectable } from '@nestjs/common';
import { BankTransaction, Payment, DTE } from '@prisma/client';
import { MatchingStrategy, MatchCandidate } from '../domain/matching.interfaces';

@Injectable()
export class ApproximateMatchStrategy implements MatchingStrategy {
    public name = 'ApproximateMatch';

    // Configurable tolerances
    // Configurable tolerances
    private readonly DAYS_TOLERANCE = 120; // Expanded to ~4 months per user request
    private readonly AMOUNT_TOLERANCE = 1000; // CLP (User requested +/- 1000)

    async findMatches(
        transaction: BankTransaction,
        payments: Payment[],
        dtes: DTE[],
    ): Promise<MatchCandidate | null> {
        const candidates: MatchCandidate['candidates'] = [];

        // Check Payments
        for (const payment of payments) {
            const score = this.calculateScore(transaction, payment.amount, payment.paymentDate);
            if (score >= 0.7) { // Threshold
                candidates.push({
                    payment,
                    score,
                    reason: `Approximate Match (Score: ${score.toFixed(2)})`,
                });
            }
        }

        // Check DTEs
        for (const dte of dtes) {
            const score = this.calculateScore(transaction, dte.totalAmount, dte.issuedDate);
            if (score >= 0.7) {
                candidates.push({
                    dte,
                    score,
                    reason: `Approximate Match (Score: ${score.toFixed(2)})`,
                });
            }
        }

        if (candidates.length > 0) {
            return {
                transaction,
                candidates: candidates.sort((a, b) => b.score - a.score),
            };
        }

        return null;
    }

    private calculateScore(
        tx: BankTransaction,
        candidateAmount: number,
        candidateDate: Date
    ): number {
        const amountDiff = Math.abs(Math.abs(tx.amount) - Math.abs(candidateAmount));
        const daysDiff = this.getDaysDiff(tx.date, candidateDate);

        // Filter out if outside hard tolerance
        if (amountDiff > this.AMOUNT_TOLERANCE) return 0;
        if (daysDiff > this.DAYS_TOLERANCE) return 0;

        // SCORING LOGIC
        // Base 1.0
        let penalty = 0.0;

        // Date Penalty: Max 0.15 for full duration tolerance
        // equation: (days / max_days) * weight
        penalty += (daysDiff / this.DAYS_TOLERANCE) * 0.15;

        // Amount Penalty: Max 0.15 for full amount tolerance
        // equation: (diff / max_diff) * weight
        if (amountDiff > 0) {
            penalty += (amountDiff / this.AMOUNT_TOLERANCE) * 0.15;
        }

        // Result:
        // Worst case (Max Date + Max Amount diff): 1.0 - 0.15 - 0.15 = 0.70 (Accepted)
        // Best case (0 diffs): 1.0

        return Math.max(0, 1.0 - penalty);
    }

    private getDaysDiff(d1: Date, d2: Date): number {
        const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
        // Use UTC to avoid timezone issues affecting "days"
        const diffDays = Math.round(Math.abs((d1.getTime() - d2.getTime()) / oneDay));
        return diffDays;
    }
}
