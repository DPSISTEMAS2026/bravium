import { BankTransaction, DTE, Payment } from '@prisma/client';

export interface MatchingConfig {
    toleranceDays: number;
    toleranceAmount: number;
}

export interface MatchingContext {
    transaction: BankTransaction;
    candidates: {
        payments: Payment[];
        dtes: DTE[];
    };
    config: MatchingConfig;
}

export interface MatchResult {
    candidateId: string;
    candidateType: 'PAYMENT' | 'DTE';
    confidence: number; // 0.0 to 1.0
    ruleName: string;
    details: string;
}

export interface IMatchingStrategy {
    readonly name: string;
    match(context: MatchingContext): MatchResult[];
}
