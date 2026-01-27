import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class FinancialExplanationService {
    constructor(private prisma: PrismaService) { }

    /**
     * Explains why a provider has a specific balance.
     * Returns a timeline of events that formed the balance.
     */
    async explainProviderBalance(providerId: string) {
        // 1. Get Current Balance (Source of Truth Cache)
        const provider = await this.prisma.provider.findUnique({
            where: { id: providerId },
            include: {
                // Include partial history for context if needed
            }
        });

        if (!provider) throw new Error('Provider not found');

        // 2. Fetch Ledger History (Source of Truth Detail)
        const entries = await this.prisma.financialLedgerEntry.findMany({
            where: { providerId },
            orderBy: { transactionDate: 'desc' },
            take: 50, // Limit for UI performance, add pagination later
        });

        // 3. Construct Narrative
        // Calculate composition
        let totalInvoiced = 0;
        let totalPaid = 0;
        let totalAdjustments = 0;

        // Use aggregate query strictly for sum
        const aggregate = await this.prisma.financialLedgerEntry.aggregate({
            where: { providerId },
            _sum: { amount: true },
        });
        // This aggregate should match provider.currentBalance

        // Breakdown
        const breakdown = await this.prisma.financialLedgerEntry.groupBy({
            by: ['type'],
            where: { providerId },
            _sum: { amount: true }
        });

        return {
            providerName: provider.name,
            currentBalance: provider.currentBalance,
            verifiedBalance: aggregate._sum.amount,
            isConsistent: provider.currentBalance === aggregate._sum.amount,
            composition: breakdown.map(b => ({ type: b.type, total: b._sum.amount })),
            recentHistory: entries.map(e => ({
                date: e.transactionDate,
                type: e.type,
                amount: e.amount,
                description: e.description,
                reference: `${e.referenceType} #${e.referenceId || 'N/A'}`
            }))
        };
    }

    /**
     * Explains a specific DTE status.
     * "Why is this invoice still unpaid?"
     */
    async explainDteStatus(dteId: string) {
        const dte = await this.prisma.dTE.findUnique({
            where: { id: dteId },
            include: { matches: true }
        });
        // Implementation details...
        return dte;
    }
}
