import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PeriodStatus, BalanceAdjustment, AdjustmentReason, ReconciliationMatch, MatchStatus, DtePaymentStatus } from '@prisma/client';
import { CreatePeriodDto, ClosePeriodResult } from '../domain/financial-period.types';

@Injectable()
export class AccountingPeriodService {
    private readonly logger = new Logger(AccountingPeriodService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Opens a new accounting period (e.g., April 2024).
     * Ensures no overlap or duplicates.
     */
    async openPeriod(organizationId: string, dto: CreatePeriodDto) {
        const existing = await this.prisma.accountingPeriod.findUnique({
            where: {
                year_month_organizationId: { year: dto.year, month: dto.month, organizationId },
            },
        });

        if (existing) {
            throw new BadRequestException(`Period ${dto.month}/${dto.year} already exists.`);
        }

        const startDate = new Date(dto.year, dto.month - 1, 1);
        const endDate = new Date(dto.year, dto.month, 0); // Last day of month

        return this.prisma.accountingPeriod.create({
            data: {
                year: dto.year,
                month: dto.month,
                startDate,
                endDate,
                status: PeriodStatus.OPEN,
                organizationId,
            },
        });
    }

    /**
     * Closes a period.
     * Logic:
     * 1. Check for 'DRAFT' matches within the date range. If any, refuse to close (or warn).
     * 2. Calculate carry-overs for unresolved small differences if configured? 
     *    Actually, small differences are usually resolved AS adjustments immediately.
     *    Carry-over applies to unpaid invoices/providers.
     * 3. Lock the period.
     */
    async closePeriod(organizationId: string, year: number, month: number): Promise<ClosePeriodResult> {
        const period = await this.prisma.accountingPeriod.findUnique({
            where: { year_month_organizationId: { year, month, organizationId } },
        });

        if (!period) throw new BadRequestException('Period not found');
        if (period.status !== PeriodStatus.OPEN) throw new BadRequestException('Period is not OPEN');

        this.logger.log(`Attempting to close period ${month}/${year}`);

        // 1. Validation: Are there pending drafts in this period?
        // Matches linked to transactions within [startDate, endDate]
        const pendingMatches = await this.prisma.reconciliationMatch.count({
            where: {
                status: MatchStatus.DRAFT,
                organizationId,
                transaction: {
                    date: {
                        gte: period.startDate,
                        lte: period.endDate,
                    }
                }
            }
        });

        if (pendingMatches > 0) {
            throw new BadRequestException(`Cannot close period. There are ${pendingMatches} pending matches.`);
        }

        // 2. Lock Period
        const closedPeriod = await this.prisma.accountingPeriod.update({
            where: { id: period.id },
            data: { status: PeriodStatus.CLOSED },
        });

        // 3. (Optional) Snapshot or Carry Over Logic
        // In this streamlined architecture, balances simply "remain" on the Provider/DTE.
        // We don't need to create "CarryOver" entities unless we are "closing books" physically.
        // For now, we return warnings if there are unpaid DTEs from this period.

        // Check unpaid DTEs issued in this period
        const unpaidDteCount = await this.prisma.dTE.count({
            where: {
                issuedDate: { gte: period.startDate, lte: period.endDate },
                paymentStatus: { not: DtePaymentStatus.PAID },
            }
        });

        const warnings = [];
        if (unpaidDteCount > 0) {
            warnings.push(`${unpaidDteCount} DTEs from this period remain unpaid/partial. They will carry over.`);
        }

        return {
            closedPeriod,
            carriedOverAdjustments: [],
            warnings,
        };
    }

    async getPeriod(organizationId: string, year: number, month: number) {
        return this.prisma.accountingPeriod.findUnique({
            where: { year_month_organizationId: { year, month, organizationId } },
            include: { adjustments: true },
        });
    }
}
