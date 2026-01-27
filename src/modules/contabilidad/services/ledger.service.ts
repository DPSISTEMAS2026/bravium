import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
    FinancialLedgerEntry,
    LedgerEntryType,
    ReferenceType,
    AccountingPeriod,
    Provider
} from '@prisma/client';

export interface LedgerEntryDto {
    providerId: string;
    transactionDate: Date;
    type: LedgerEntryType;
    amount: number;
    referenceType: ReferenceType;
    referenceId: string;
    description?: string;
}

@Injectable()
export class LedgerService {
    private readonly logger = new Logger(LedgerService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Records a new immutable entry in the Financial Ledger.
     * Updates the Provider's cached balance atomically.
     */
    async recordEntry(dto: LedgerEntryDto): Promise<FinancialLedgerEntry> {
        this.logger.log(`Recording Ledger Entry for Provider ${dto.providerId}: ${dto.type} $${dto.amount}`);

        // 1. Resolve Period
        // Assuming period exists via date, or we assign NULL if global.
        // Ideally we should look up the PeriodId based on transactionDate.
        // Simplified for now.

        return this.prisma.$transaction(async (tx) => {
            // Create Entry
            const entry = await tx.financialLedgerEntry.create({
                data: {
                    providerId: dto.providerId,
                    transactionDate: dto.transactionDate,
                    type: dto.type,
                    amount: dto.amount,
                    referenceType: dto.referenceType,
                    referenceId: dto.referenceId,
                    description: dto.description,
                    // periodId: resolvedPeriodId... (TODO)
                }
            });

            // Update Provider Balance Cache
            // Decrement or Increment based on signed amount.
            // If amount is POSITIVE (Invoice), it increases balance (Debt).
            // If amount is NEGATIVE (Payment), it decreases balance.
            await tx.provider.update({
                where: { id: dto.providerId },
                data: {
                    currentBalance: { increment: dto.amount }
                }
            });

            return entry;
        });
    }

    /**
     * Re-calculates a Provider's balance from the beginning of time (or last Opening Balance).
     * This is the "Source of Truth" recovery method.
     */
    async recalculateProviderBalance(providerId: string): Promise<number> {
        const aggregate = await this.prisma.financialLedgerEntry.aggregate({
            where: { providerId },
            _sum: { amount: true }
        });

        const realBalance = aggregate._sum.amount || 0;

        // Update cache
        await this.prisma.provider.update({
            where: { id: providerId },
            data: { currentBalance: realBalance }
        });

        return realBalance;
    }

    /**
     * Explains why a provider has a certain balance.
     * Returns operation history.
     */
    async getProviderHistory(providerId: string) {
        return this.prisma.financialLedgerEntry.findMany({
            where: { providerId },
            orderBy: { transactionDate: 'desc' },
        });
    }
}
