import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataVisibilityService } from '../../common/services/data-visibility.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';

@Injectable()
export class ConciliacionDashboardService {
    private readonly logger = new Logger(ConciliacionDashboardService.name);

    constructor(
        private prisma: PrismaService,
        private readonly visibility: DataVisibilityService,
    ) { }

    /**
     * Obtiene el dashboard completo de conciliación con filtros avanzados
     */
    async getDashboard(filters: DashboardFiltersDto = {}) {
        // Backward compatibility: extract fromDate/toDate from filters
        let fromDate = filters.fromDate;
        let toDate = filters.toDate;
        try {
            this.logger.log(`Getting dashboard for period: ${fromDate || 'all'} to ${toDate || 'all'}`);

            // Validar fechas
            if (fromDate && isNaN(Date.parse(fromDate))) {
                this.logger.warn(`Invalid fromDate: ${fromDate}`);
                fromDate = undefined;
            }
            if (toDate && isNaN(Date.parse(toDate))) {
                this.logger.warn(`Invalid toDate: ${toDate}`);
                toDate = undefined;
            }

            // Defaults in case of failure
            const defaultTransactionStats = { total: 0, matched: 0, pending: 0, match_rate: '0%', total_amount: 0 };
            const defaultDteStats = { total: 0, paid: 0, unpaid: 0, partially_paid: 0, payment_rate: '0%', total_amount: 0, outstanding_amount: 0 };
            const defaultMatchStats = { total: 0, confirmed: 0, draft: 0, automatic: 0, manual: 0, auto_rate: '0%' };

            // Execute safely
            const [
                transactionStats,
                dteStats,
                matchStats,
                pendingTransactions,
                pendingDtes,
                recentMatches,
                topProviders,
                unmatchedHighValue
            ] = await Promise.all([
                this.safeRun(() => this.getTransactionStats(filters), defaultTransactionStats, 'TransactionStats'),
                this.safeRun(() => this.getDteStats(filters), defaultDteStats, 'DteStats'),
                this.safeRun(() => this.getMatchStats(filters), defaultMatchStats, 'MatchStats'),
                this.safeRun(() => this.getPendingTransactions(filters, 20), [], 'PendingTransactions'),
                this.safeRun(() => this.getPendingDtes(filters, 20), [], 'PendingDtes'),
                this.safeRun(() => this.getRecentMatches(filters, 50), [], 'RecentMatches'),
                this.safeRun(() => this.getTopProviders(filters, 10), [], 'TopProviders'),
                this.safeRun(() => this.getUnmatchedHighValue(filters, 10), { transactions: [], dtes: [] }, 'UnmatchedHighValue')
            ]);

            return {
                period: {
                    from: fromDate || 'all',
                    to: toDate || 'all'
                },
                summary: {
                    transactions: transactionStats,
                    dtes: dteStats,
                    matches: matchStats
                },
                pending: {
                    transactions: pendingTransactions,
                    dtes: pendingDtes
                },
                recent_matches: recentMatches,
                insights: {
                    top_providers: topProviders,
                    high_value_unmatched: unmatchedHighValue
                }
            };
        } catch (error) {
            this.logger.error(`Error getting dashboard: ${error.message}`, error.stack);
            throw error;
        }
    }

    private async safeRun<T>(fn: () => Promise<T>, fallback: T, context: string): Promise<T> {
        try {
            return await fn();
        } catch (error) {
            this.logger.error(`Error in ${context}: ${error.message}`, error.stack);
            return fallback;
        }
    }

    /**
     * Estadísticas de transacciones bancarias
     */
    private async getTransactionStats(filters: DashboardFiltersDto) {
        const dateFilter = this.buildTransactionDateFilter(filters);

        const dateFilterWithDebit = { ...dateFilter, type: 'DEBIT' as const };

        const [total, matched, pending, totalAmount] = await Promise.all([
            this.prisma.bankTransaction.count({ where: dateFilterWithDebit }),
            this.prisma.bankTransaction.count({
                where: {
                    ...dateFilterWithDebit,
                    status: 'MATCHED'
                }
            }),
            this.prisma.bankTransaction.count({
                where: {
                    ...dateFilterWithDebit,
                    status: 'PENDING'
                }
            }),
            this.prisma.bankTransaction.aggregate({
                where: dateFilterWithDebit,
                _sum: { amount: true }
            })
        ]);

        return {
            total,
            matched,
            pending,
            match_rate: total > 0 ? ((matched / total) * 100).toFixed(1) + '%' : '0%',
            total_amount: totalAmount._sum.amount || 0
        };
    }

    /**
     * Estadísticas de DTEs
     */
    private async getDteStats(filters: DashboardFiltersDto) {
        const dateFilter = this.buildDteDateFilter(filters);

        const [total, paid, unpaid, partiallyPaid, totalAmount, outstandingAmount] = await Promise.all([
            this.prisma.dTE.count({ where: dateFilter }),
            this.prisma.dTE.count({
                where: {
                    ...dateFilter,
                    paymentStatus: 'PAID'
                }
            }),
            this.prisma.dTE.count({
                where: {
                    ...dateFilter,
                    paymentStatus: 'UNPAID'
                }
            }),
            this.prisma.dTE.count({
                where: {
                    ...dateFilter,
                    paymentStatus: 'PARTIAL'
                }
            }),
            this.prisma.dTE.aggregate({
                where: dateFilter,
                _sum: { totalAmount: true }
            }),
            this.prisma.dTE.aggregate({
                where: dateFilter,
                _sum: { outstandingAmount: true }
            })
        ]);

        return {
            total,
            paid,
            unpaid,
            partially_paid: partiallyPaid,
            payment_rate: total > 0 ? ((paid / total) * 100).toFixed(1) + '%' : '0%',
            total_amount: totalAmount._sum.totalAmount || 0,
            outstanding_amount: outstandingAmount._sum.outstandingAmount || 0
        };
    }

    /**
     * Estadísticas de matches
     */
    /**
     * Estadísticas de matches filtradas por periodo
     */
    private async getMatchStats(filters: DashboardFiltersDto) {
        // Construir filtro basado en la fecha de la transacción asociada
        const dateFilter: any = {};
        if (filters.fromDate || filters.toDate) {
            dateFilter.transaction = {
                date: this.buildTransactionDateFilter(filters).date
            };
        }

        const [total, confirmed, draft, automatic, manual] = await Promise.all([
            this.prisma.reconciliationMatch.count({
                where: dateFilter
            }),
            this.prisma.reconciliationMatch.count({
                where: { ...dateFilter, status: 'CONFIRMED' }
            }),
            this.prisma.reconciliationMatch.count({
                where: { ...dateFilter, status: 'DRAFT' } // Aunque ya no debería haber drafts
            }),
            this.prisma.reconciliationMatch.count({
                where: { ...dateFilter, origin: 'AUTOMATIC' }
            }),
            this.prisma.reconciliationMatch.count({
                where: { ...dateFilter, origin: 'MANUAL' }
            })
        ]);

        return {
            total,
            confirmed,
            draft,
            automatic,
            manual,
            auto_rate: total > 0 ? ((automatic / total) * 100).toFixed(1) + '%' : '0%'
        };
    }

    /**
     * Transacciones bancarias pendientes de conciliar
     */
    private async getPendingTransactions(filters: DashboardFiltersDto, limit: number = 20) {
        const dateFilter = this.buildTransactionDateFilter(filters);

        return this.prisma.bankTransaction.findMany({
            where: {
                ...dateFilter,
                status: 'PENDING',
                type: 'DEBIT'
            },
            orderBy: [
                { amount: 'desc' }, // Priorizar montos altos
                { date: 'desc' }
            ],
            take: limit,
            select: {
                id: true,
                date: true,
                amount: true,
                description: true,
                reference: true,
                type: true,
                bankAccount: {
                    select: {
                        accountNumber: true,
                        bankName: true
                    }
                }
            }
        });
    }

    /**
     * DTEs pendientes de pago
     */
    private async getPendingDtes(filters: DashboardFiltersDto, limit: number = 20) {
        const dateFilter = this.buildDteDateFilter(filters);

        return this.prisma.dTE.findMany({
            where: {
                ...dateFilter,
                paymentStatus: 'UNPAID'
            },
            orderBy: [
                { outstandingAmount: 'desc' }, // Priorizar montos altos
                { issuedDate: 'desc' }
            ],
            take: limit,
            select: {
                id: true,
                folio: true,
                type: true,
                totalAmount: true,
                outstandingAmount: true,
                issuedDate: true,
                rutIssuer: true,
                provider: {
                    select: {
                        name: true,
                        rut: true
                    }
                }
            }
        });
    }

    /**
     * Matches filtrados por periodo de la transacción
     */
    private async getRecentMatches(filters: DashboardFiltersDto, limit: number = 50) {
        const where: any = {};
        if (filters.fromDate || filters.toDate) {
            where.transaction = { date: {} };
            if (filters.fromDate) where.transaction.date.gte = new Date(filters.fromDate);
            if (filters.toDate) where.transaction.date.lte = new Date(filters.toDate);
        }
        if (filters.organizationId) {
            where.transaction = {
                ...where.transaction,
                bankAccount: { organizationId: filters.organizationId }
            };
        }

        return this.prisma.reconciliationMatch.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                status: true,
                origin: true,
                confidence: true,
                ruleApplied: true,
                notes: true,
                confirmedAt: true,
                confirmedBy: true,
                createdBy: true,
                createdAt: true,
                transaction: {
                    select: {
                        id: true,
                        date: true,
                        amount: true,
                        description: true
                    }
                },
                dte: {
                    select: {
                        id: true,
                        folio: true,
                        type: true,
                        totalAmount: true,
                        provider: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
                payment: {
                    select: {
                        id: true,
                        amount: true,
                        paymentDate: true,
                        provider: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Top proveedores por monto pendiente
     */
    private async getTopProviders(filters: DashboardFiltersDto, limit: number = 10) {
        const dateFilter = this.buildDteDateFilter(filters);

        const dtes = await this.prisma.dTE.findMany({
            where: {
                ...dateFilter,
                paymentStatus: { in: ['UNPAID', 'PARTIAL'] }
            },
            select: {
                outstandingAmount: true,
                totalAmount: true,
                provider: {
                    select: {
                        id: true,
                        name: true,
                        rut: true
                    }
                }
            }
        });

        // Agrupar por proveedor
        const providerMap = new Map<string, any>();

        dtes.forEach(dte => {
            if (!dte.provider) return;

            const key = dte.provider.id;
            if (!providerMap.has(key)) {
                providerMap.set(key, {
                    provider: dte.provider,
                    total_outstanding: 0,
                    total_amount: 0,
                    dte_count: 0
                });
            }

            const entry = providerMap.get(key);
            entry.total_outstanding += dte.outstandingAmount;
            entry.total_amount += dte.totalAmount;
            entry.dte_count += 1;
        });

        // Convertir a array y ordenar
        return Array.from(providerMap.values())
            .sort((a, b) => b.total_outstanding - a.total_outstanding)
            .slice(0, limit);
    }

    /**
     * Transacciones y DTEs de alto valor sin match
     */
    private async getUnmatchedHighValue(filters: DashboardFiltersDto, limit: number = 10) {
        const threshold = 1000000; // $1M CLP
        const txDateFilter = this.buildTransactionDateFilter(filters);
        const dteDateFilter = this.buildDteDateFilter(filters);

        const [transactions, dtes] = await Promise.all([
            this.prisma.bankTransaction.findMany({
                where: {
                    ...txDateFilter,
                    status: 'PENDING',
                    amount: { gte: threshold }
                },
                orderBy: { amount: 'desc' },
                take: limit,
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    description: true,
                    type: true
                }
            }),
            this.prisma.dTE.findMany({
                where: {
                    ...dteDateFilter,
                    paymentStatus: 'UNPAID',
                    outstandingAmount: { gte: threshold }
                },
                orderBy: { outstandingAmount: 'desc' },
                take: limit,
                select: {
                    id: true,
                    folio: true,
                    type: true,
                    outstandingAmount: true,
                    issuedDate: true,
                    provider: {
                        select: {
                            name: true
                        }
                    }
                }
            })
        ]);

        return {
            transactions,
            dtes
        };
    }

    /**
     * Construye filtro de fechas para transacciones bancarias
     */
    private buildTransactionDateFilter(filters: DashboardFiltersDto) {
        const minDate = this.visibility.applyMinDate(
            filters.fromDate ? new Date(filters.fromDate) : undefined,
        );

        const filter: any = {};
        
        if (filters.organizationId) {
            filter.bankAccount = { organizationId: filters.organizationId };
        }

        if (minDate || filters.toDate) {
            filter.date = {};
            if (minDate) filter.date.gte = minDate;
            if (filters.toDate) filter.date.lte = new Date(filters.toDate);
        }

        return filter;
    }

    /**
     * Construye filtro de fechas para DTEs
     */
    private buildDteDateFilter(filters: DashboardFiltersDto) {
        const minDate = this.visibility.applyMinDate(
            filters.fromDate ? new Date(filters.fromDate) : undefined,
        );

        const filter: any = {};
        
        if (filters.organizationId) {
            filter.provider = { organizationId: filters.organizationId };
        }

        if (minDate || filters.toDate) {
            filter.issuedDate = {};
            if (minDate) filter.issuedDate.gte = minDate;
            if (filters.toDate) filter.issuedDate.lte = new Date(filters.toDate);
        }

        return filter;
    }
}
