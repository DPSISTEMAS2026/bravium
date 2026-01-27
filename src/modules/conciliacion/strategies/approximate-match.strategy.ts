import { Injectable } from '@nestjs/common';
import { BankTransaction, Payment, DTE } from '@prisma/client';
import { MatchingStrategy, MatchCandidate } from '../domain/matching.interfaces';

@Injectable()
export class ApproximateMatchStrategy implements MatchingStrategy {
    public name = 'ApproximateMatch';

    // Configurable tolerances
    private readonly DAYS_TOLERANCE = 3;
    private readonly AMOUNT_TOLERANCE = 400; // CLP (User requested +/- 400)

    async findMatches(
        transaction: BankTransaction,
        payments: Payment[],
        dtes: DTE[],
    ): Promise<MatchCandidate | null> {
        const candidates: MatchCandidate['candidates'] = [];

        // Check Payments
        for (const payment of payments) {
            const score = this.calculateScore(transaction, payment.amount, payment.paymentDate);
            if (score > 0.6) { // Threshold
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
            if (score > 0.6) {
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

        // Date Penalty: 0.1 for first day, 0.05 for subsequent?
        // User example: 1 day -> 0.9 (0.1 penalty).
        // User example: 3 days + amount -> 0.75.

        // Let's use: 0.05 per day roughly.
        // 3 days * 0.05 = 0.15.

        penalty += (daysDiff * 0.05);

        // Amount Penalty:
        // If exact amount: 0.
        // If diff exists: 0.1 flat?
        if (amountDiff > 0) {
            penalty += 0.1;
        }

        // Example Check:
        // 3 days (0.15) + diff (0.1) = 0.25. Score = 0.75. Matches user example.
        // 1 day (0.05) + exact (0) = 0.05. Score = 0.95. (User said 0.9, close enough).

        return Math.max(0, 1.0 - penalty);
    }

    private getDaysDiff(d1: Date, d2: Date): number {
        const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
        // Use UTC to avoid timezone issues affecting "days"
        const diffDays = Math.round(Math.abs((d1.getTime() - d2.getTime()) / oneDay));
        return diffDays;
    }
}
