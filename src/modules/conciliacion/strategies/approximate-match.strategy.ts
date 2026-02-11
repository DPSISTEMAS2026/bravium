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
            if (this.isMatch(transaction, payment.amount, payment.paymentDate)) {
                candidates.push({
                    payment,
                    score: 0.8, // Fixed internal value < 1.0 to indicate DRAFT status in service
                    reason: 'Coincidencia por margen de monto y fecha',
                });
            }
        }

        // Check DTEs
        for (const dte of dtes) {
            if (this.isMatch(transaction, dte.totalAmount, dte.issuedDate)) {
                candidates.push({
                    dte,
                    score: 0.8,
                    reason: 'Coincidencia por margen de monto y fecha',
                });
            }
        }

        if (candidates.length > 0) {
            return {
                transaction,
                candidates,
            };
        }

        return null;
    }

    private isMatch(
        tx: BankTransaction,
        candidateAmount: number,
        candidateDate: Date
    ): boolean {
        const amountDiff = Math.abs(Math.abs(tx.amount) - Math.abs(candidateAmount));
        const daysDiff = this.getDaysDiff(tx.date, candidateDate);

        // Strict Tolerance Check
        if (amountDiff > this.AMOUNT_TOLERANCE) return false;
        if (daysDiff > this.DAYS_TOLERANCE) return false;

        return true;
    }

    private getDaysDiff(d1: Date, d2: Date): number {
        const oneDay = 24 * 60 * 60 * 1000;
        // Use UTC to avoid timezone issues affecting "days"
        const diffDays = Math.round(Math.abs((d1.getTime() - d2.getTime()) / oneDay));
        return diffDays;
    }
}
