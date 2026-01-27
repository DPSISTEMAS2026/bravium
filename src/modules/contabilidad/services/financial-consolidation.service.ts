import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BalanceAdjustment, AdjustmentReason, ReconciliationMatch, MatchStatus, DtePaymentStatus } from '@prisma/client';
import { AccountingPeriodService } from './accounting-period.service';
import { LedgerService } from './ledger.service';
import { LedgerEntryType, ReferenceType } from '@prisma/client';

@Injectable()
export class FinancialConsolidationService {
    private readonly logger = new Logger(FinancialConsolidationService.name);

    constructor(
        private prisma: PrismaService,
        private periodService: AccountingPeriodService,
        private ledgerService: LedgerService
    ) { }

    /**
     * Registers a small difference adjustment when reconciling.
     * This is usually called from ConciliacionModule when a user accepts a Fuzzy Match.
     */
    async registerBalanceAdjustment(
        matchId: string,
        amountDiff: number,
        userId: string
    ): Promise<BalanceAdjustment> {

        // 1. Determine period based on match/transaction date
        const match = await this.prisma.reconciliationMatch.findUnique({
            where: { id: matchId },
            include: { transaction: true, dte: true }, // Include dte for ledger entry
        });
        if (!match) throw new Error('Match not found');

        const date = match.transaction.date;
        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        // Ensure period exists or get current open one
        let period = await this.periodService.getPeriod(year, month);
        if (!period) {
            // Should we auto-create? For safety, maybe fail or create.
            // Let's assume period must exist.
            throw new Error(`Period ${month}/${year} is not open or does not exist.`);
        }

        if (period.status === 'CLOSED' || period.status === 'LOCKED') {
            throw new Error('Cannot adjust balance in a closed period.');
        }

        // 2. Determine Reason
        // If diff is positive (We paid less? or We received more?) depends on Transaction Type.
        // Simplifying assumption: automatic small difference.
        const reason = amountDiff > 0
            ? AdjustmentReason.SMALL_DIFFERENCE_FAVOR
            : AdjustmentReason.SMALL_DIFFERENCE_AGAINST;

        // 3. Create Adjustment
        const adjustment = await this.prisma.balanceAdjustment.create({
            data: {
                amount: amountDiff, // Can be signed
                reason,
                matchId: match.id,
                periodId: period.id,
                description: `Auto-adjustment from match ${matchId}`,
                createdBy: userId,
            },
        });

        // 4. Record in Ledger
        // If it's a difference in FAVOR (Income/Gain), it REDUCES debt? 
        // Or if we are paying less than debt, we write off the rest.
        // Example: Inv $1000, Pay $900. Diff $100.
        // We want to clear the Inv. So we need to reduce the remaining $100 Provider Debt.
        // So amount should be NEGATIVE in the ledger (Reducing Liability).

        // Logic: 
        // If SMALL_DIFFERENCE_FAVOR -> We paid less, but debt is cleared. Adjustment is effectively a "Payment" from the ether.
        // So Amount = -abs(amountDiff).
        // If SMALL_DIFFERENCE_AGAINST -> We paid more? Or we owe more?
        // Usually "Against" means we lost money. 

        // Simplified: Adjustments here are meant to CLOSE the debt.
        // So we apply an adjustment equal to the outstanding amount usually.
        // But here we receive `amountDiff`. 
        // If `amountDiff` is positive (Income/Favor), we reduce debt.
        // If `amountDiff` is negative (Expense), we increase debt? Or just expense it?
        // Let's assume standard behavior: This adjustment acts to zero out the gap.

        // For Provider Ledger:
        // If we write off $100 of debt, we add -$100 to ledger.
        if (match.dte && match.dte.providerId) {
            // Determine direction. 
            // If amountDiff was "Gain", we reduce debt.
            // If "Loss", we might increase debt or just pay it.
            // Let's assume passed amountDiff is signed correctly relative to the Balance.

            await this.ledgerService.recordEntry({
                providerId: match.dte.providerId,
                transactionDate: date, // Use transaction date
                type: LedgerEntryType.ADJUSTMENT,
                referenceType: ReferenceType.ADJUSTMENT,
                referenceId: adjustment.id, // Link to the newly created BalanceAdjustment
                amount: -amountDiff, // Invert sign? Logic needs to be careful here. Assuming caller passes "Correction Amount".
                description: `Adjustment for Match ${match.id}`
            });
        }

        return adjustment;
    }

    /**
     * Refreshes the financial status of a DTE based on its matches.
     * Calculates if it's PAID, PARTIAL, or OVERPAID.
     */
    async updateDteFinancialStatus(dteId: string) {
        const dte = await this.prisma.dTE.findUnique({
            where: { id: dteId },
            include: { matches: { include: { transaction: true } } },
        });

        if (!dte) return;

        // Sum allocated amounts from transactions
        // Assuming 1 Match = 1 BankTransaction fully allocated to this DTE?
        // In complex scenarios, a transaction might split. For MVP, 1-to-1 or N-to-1.

        let totalPaid = 0;
        for (const match of dte.matches) {
            if (match.status === MatchStatus.CONFIRMED) {
                totalPaid += match.transaction.amount;
                // NOTE: logic needs to handle Credit/Debit direction properly
            }
        }

        const outstanding = dte.totalAmount - totalPaid; // Simple logic for Purchase Inv

        let status: DtePaymentStatus = DtePaymentStatus.UNPAID;
        if (outstanding === 0) status = DtePaymentStatus.PAID;
        else if (outstanding < 0) status = DtePaymentStatus.OVERPAID;
        else if (outstanding < dte.totalAmount) status = DtePaymentStatus.PARTIAL;

        await this.prisma.dTE.update({
            where: { id: dteId },
            data: {
                outstandingAmount: outstanding,
                paymentStatus: status,
            }
        });

        this.logger.log(`DTE ${dte.folio} status updated to ${status}. Outstanding: ${outstanding}`);
    }
}
