import { BankTransaction, Payment, DTE } from '@prisma/client';

export interface MatchCandidate {
    transaction: BankTransaction;
    candidates: {
        payment?: Payment;
        dte?: DTE;
        score: number;
        reason: string; // "Exact Match", "Fuzzy Date", etc.
    }[];
}

export interface MatchingStrategy {
    name: string;
    findMatches(
        transaction: BankTransaction,
        payments: Payment[],
        dtes: DTE[]
    ): Promise<MatchCandidate | null>;
}
