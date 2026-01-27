import { Injectable } from '@nestjs/common';
import { BankTransaction, Payment, DTE, TransactionType } from '@prisma/client';
import { MatchingStrategy, MatchCandidate } from '../domain/matching.interfaces';

@Injectable()
export class ExactMatchStrategy implements MatchingStrategy {
    public name = 'ExactMatch';

    async findMatches(
        transaction: BankTransaction,
        payments: Payment[],
        dtes: DTE[],
    ): Promise<MatchCandidate | null> {
        const candidates: MatchCandidate['candidates'] = [];

        // 1. Try to match with Payments (usually for DEBITs - Money Out)
        // But we check all passed candidates assuming the caller filtered them relevantly.
        for (const payment of payments) {
            if (
                this.isSameAmount(transaction.amount, payment.amount) &&
                this.isSameDay(transaction.date, payment.paymentDate)
            ) {
                candidates.push({
                    payment,
                    score: 1.0,
                    reason: 'Exact Amount and Date Match',
                });
            }
        }

        // 2. Try to match with DTEs (Direct matches without payment record)
        for (const dte of dtes) {
            // Validation: Logic depends on CREDIT vs DEBIT.
            // For now, simpler exact match on amount/date.
            if (
                this.isSameAmount(transaction.amount, dte.totalAmount) &&
                this.isSameDay(transaction.date, dte.issuedDate)
            ) {
                candidates.push({
                    dte,
                    score: 1.0,
                    reason: 'Exact Amount and Date Match with DTE',
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

    private isSameAmount(a: number, b: number): boolean {
        return Math.abs(a) === Math.abs(b);
    }

    private isSameDay(d1: Date, d2: Date): boolean {
        const cleanD1 = new Date(d1);
        const cleanD2 = new Date(d2);
        return (
            cleanD1.getUTCFullYear() === cleanD2.getUTCFullYear() &&
            cleanD1.getUTCMonth() === cleanD2.getUTCMonth() &&
            cleanD1.getUTCDate() === cleanD2.getUTCDate()
        );
    }
}
