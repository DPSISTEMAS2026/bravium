import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ReportesService {
    private readonly logger = new Logger(ReportesService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Reporte de deuda por proveedor
     */
    async getDeudaPorProveedor(fromDate?: string, toDate?: string) {
        const where: any = {};

        if (fromDate || toDate) {
            where.issuedDate = {};
            if (fromDate) where.issuedDate.gte = new Date(fromDate);
            if (toDate) where.issuedDate.lte = new Date(toDate);
        }

        const dtes = await this.prisma.dTE.findMany({
            where,
            include: {
                provider: true,
            },
        });

        // Agrupar por proveedor
        const providerMap = new Map<string, any>();

        dtes.forEach((dte) => {
            if (!dte.provider) return;

            const providerId = dte.provider.id;
            if (!providerMap.has(providerId)) {
                providerMap.set(providerId, {
                    provider: dte.provider,
                    totalInvoiced: 0,
                    totalOutstanding: 0,
                    invoiceCount: 0,
                    unpaidCount: 0,
                    invoices: [],
                });
            }

            const data = providerMap.get(providerId);
            data.totalInvoiced += dte.totalAmount;
            data.totalOutstanding += dte.outstandingAmount;
            data.invoiceCount++;
            if (dte.paymentStatus === 'UNPAID') {
                data.unpaidCount++;
            }
            data.invoices.push({
                folio: dte.folio,
                type: dte.type,
                totalAmount: dte.totalAmount,
                outstandingAmount: dte.outstandingAmount,
                issuedDate: dte.issuedDate,
                paymentStatus: dte.paymentStatus,
            });
        });

        const result = Array.from(providerMap.values())
            .map((item) => ({
                ...item,
                paidAmount: item.totalInvoiced - item.totalOutstanding,
                paymentRate:
                    item.totalInvoiced > 0
                        ? ((item.totalInvoiced - item.totalOutstanding) /
                            item.totalInvoiced) *
                        100
                        : 0,
            }))
            .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

        return {
            providers: result,
            summary: {
                totalProviders: result.length,
                totalInvoiced: result.reduce((sum, p) => sum + p.totalInvoiced, 0),
                totalOutstanding: result.reduce(
                    (sum, p) => sum + p.totalOutstanding,
                    0
                ),
                totalPaid: result.reduce((sum, p) => sum + p.paidAmount, 0),
            },
        };
    }

    /**
     * Reporte de flujo de caja
     */
    async getFlujoCaja(fromDate?: string, toDate?: string) {
        const where: any = {};

        if (fromDate || toDate) {
            where.date = {};
            if (fromDate) where.date.gte = new Date(fromDate);
            if (toDate) where.date.lte = new Date(toDate);
        }

        const transactions = await this.prisma.bankTransaction.findMany({
            where,
            include: {
                bankAccount: true,
                matches: {
                    include: {
                        dte: {
                            include: {
                                provider: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                date: 'asc',
            },
        });

        // Agrupar por mes
        const monthlyFlow = new Map<string, any>();

        transactions.forEach((tx) => {
            const monthKey = tx.date.toISOString().substring(0, 7); // YYYY-MM

            if (!monthlyFlow.has(monthKey)) {
                monthlyFlow.set(monthKey, {
                    month: monthKey,
                    inflows: 0,
                    outflows: 0,
                    netFlow: 0,
                    transactionCount: 0,
                    matchedCount: 0,
                });
            }

            const data = monthlyFlow.get(monthKey);
            data.transactionCount++;

            if (tx.type === 'CREDIT') {
                data.inflows += tx.amount;
            } else {
                data.outflows += Math.abs(tx.amount);
            }

            if (tx.matches.length > 0) {
                data.matchedCount++;
            }
        });

        const result = Array.from(monthlyFlow.values()).map((item) => ({
            ...item,
            netFlow: item.inflows - item.outflows,
            matchRate:
                item.transactionCount > 0
                    ? (item.matchedCount / item.transactionCount) * 100
                    : 0,
        }));

        return {
            monthly: result,
            summary: {
                totalInflows: result.reduce((sum, m) => sum + m.inflows, 0),
                totalOutflows: result.reduce((sum, m) => sum + m.outflows, 0),
                netFlow: result.reduce((sum, m) => sum + m.netFlow, 0),
                totalTransactions: result.reduce(
                    (sum, m) => sum + m.transactionCount,
                    0
                ),
                totalMatched: result.reduce((sum, m) => sum + m.matchedCount, 0),
            },
        };
    }

    /**
     * Reporte de facturas vencidas
     */
    async getFacturasVencidas() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const overdueInvoices = await this.prisma.dTE.findMany({
            where: {
                paymentStatus: {
                    in: ['UNPAID', 'PARTIAL'],
                },
                issuedDate: {
                    lte: thirtyDaysAgo,
                },
            },
            include: {
                provider: true,
            },
            orderBy: {
                issuedDate: 'asc',
            },
        });

        const result = overdueInvoices.map((dte) => {
            const daysSinceIssue = Math.floor(
                (Date.now() - new Date(dte.issuedDate).getTime()) /
                (1000 * 60 * 60 * 24)
            );

            return {
                ...dte,
                daysOverdue: daysSinceIssue,
                severity:
                    daysSinceIssue > 90
                        ? 'CRITICAL'
                        : daysSinceIssue > 60
                            ? 'HIGH'
                            : daysSinceIssue > 30
                                ? 'MEDIUM'
                                : 'LOW',
            };
        });

        return {
            invoices: result,
            summary: {
                totalOverdue: result.length,
                totalAmount: result.reduce((sum, inv) => sum + inv.totalAmount, 0),
                totalOutstanding: result.reduce(
                    (sum, inv) => sum + inv.outstandingAmount,
                    0
                ),
                bySeverity: {
                    CRITICAL: result.filter((i) => i.severity === 'CRITICAL').length,
                    HIGH: result.filter((i) => i.severity === 'HIGH').length,
                    MEDIUM: result.filter((i) => i.severity === 'MEDIUM').length,
                    LOW: result.filter((i) => i.severity === 'LOW').length,
                },
            },
        };
    }
}
