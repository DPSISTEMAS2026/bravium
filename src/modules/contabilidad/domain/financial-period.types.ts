import { AccountingPeriod, PeriodStatus, BalanceAdjustment, AdjustmentReason } from '@prisma/client';

export interface CreatePeriodDto {
    year: number;
    month: number;
}

export interface ClosePeriodResult {
    closedPeriod: AccountingPeriod;
    carriedOverAdjustments: BalanceAdjustment[];
    warnings: string[];
}

export interface FinancialSnapshot {
    providerId: string;
    totalDebt: number;
    totalFavor: number;
    netBalance: number;
}
