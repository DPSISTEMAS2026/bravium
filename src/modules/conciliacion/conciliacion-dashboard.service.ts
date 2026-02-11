import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ConciliacionDashboardService {
    private readonly logger = new Logger(ConciliacionDashboardService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Obtiene el dashboard completo de conciliación para un período
     */
    async getDashboard(fromDate?: string, toDate?: string) {
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

            // Ejecutar todas las queries en paralelo con manejo de errores individual (Promise.allSettled sería ideal pero Promise.all es más rápido si asumimos estabilidad)
            // Usaremos Promise.all para fallar rápido si hay error de DB crítico
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
                this.getTransactionStats(fromDate, toDate),
                this.getDteStats(fromDate, toDate),
                this.getMatchStats(),
                this.getPendingTransactions(fromDate, toDate, 20),
                this.getPendingDtes(fromDate, toDate, 20),
                this.getRecentMatches(10),
                this.getTopProviders(fromDate, toDate, 10),
                this.getUnmatchedHighValue(fromDate, toDate, 10)
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

    /**
     * Estadísticas de transacciones bancarias
     */
    private async getTransactionStats(fromDate?: string, toDate?: string) {
        const dateFilter = this.buildTransactionDateFilter(fromDate, toDate);

        const [total, matched, pending, totalAmount] = await Promise.all([
            this.prisma.bankTransaction.count({ where: dateFilter }),
            this.prisma.bankTransaction.count({
                where: {
                    ...dateFilter,
                    status: 'MATCHED'
                }
            }),
            this.prisma.bankTransaction.count({
                where: {
                    ...dateFilter,
                    status: 'PENDING'
                }
            }),
            this.prisma.bankTransaction.aggregate({
                where: dateFilter,
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
    private async getDteStats(fromDate?: string, toDate?: string) {
        const dateFilter = this.buildDteDateFilter(fromDate, toDate);

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
                    paymentStatus: 'PARTIALLY_PAID'
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
    private async getMatchStats() {
        const [total, confirmed, draft, automatic, manual] = await Promise.all([
            this.prisma.reconciliationMatch.count(),
            this.prisma.reconciliationMatch.count({
                where: { status: 'CONFIRMED' }
            }),
            this.prisma.reconciliationMatch.count({
                where: { status: 'DRAFT' }
            }),
            this.prisma.reconciliationMatch.count({
                where: { origin: 'AUTOMATIC' }
            }),
            this.prisma.reconciliationMatch.count({
                where: { origin: 'MANUAL' }
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
    private async getPendingTransactions(fromDate?: string, toDate?: string, limit: number = 20) {
        const dateFilter = this.buildTransactionDateFilter(fromDate, toDate);

        return this.prisma.bankTransaction.findMany({
            where: {
                ...dateFilter,
                status: 'PENDING'
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
    private async getPendingDtes(fromDate?: string, toDate?: string, limit: number = 20) {
        const dateFilter = this.buildDteDateFilter(fromDate, toDate);

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
     * Matches recientes
     */
    private async getRecentMatches(limit: number) {
        return this.prisma.reconciliationMatch.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                status: true,
                origin: true,
                confidence: true,
                ruleApplied: true,
                createdAt: true,
                transaction: {
                    select: {
                        date: true,
                        amount: true,
                        description: true
                    }
                },
                dte: {
                    select: {
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
    private async getTopProviders(fromDate?: string, toDate?: string, limit: number = 10) {
        const dateFilter = this.buildDteDateFilter(fromDate, toDate);

        const dtes = await this.prisma.dTE.findMany({
            where: {
                ...dateFilter,
                paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] }
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
    private async getUnmatchedHighValue(fromDate?: string, toDate?: string, limit: number = 10) {
        const threshold = 1000000; // $1M CLP
        const txDateFilter = this.buildTransactionDateFilter(fromDate, toDate);
        const dteDateFilter = this.buildDteDateFilter(fromDate, toDate);

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
    private buildTransactionDateFilter(fromDate?: string, toDate?: string) {
        if (!fromDate && !toDate) return {};

        const filter: any = {};

        if (fromDate && toDate) {
            filter.date = {
                gte: new Date(fromDate),
                lte: new Date(toDate)
            };
        } else if (fromDate) {
            filter.date = { gte: new Date(fromDate) };
        } else if (toDate) {
            filter.date = { lte: new Date(toDate) };
        }

        return filter;
    }

    /**
     * Construye filtro de fechas para DTEs
     */
    private buildDteDateFilter(fromDate?: string, toDate?: string) {
        if (!fromDate && !toDate) return {};

        const filter: any = {};

        if (fromDate && toDate) {
            filter.issuedDate = {
                gte: new Date(fromDate),
                lte: new Date(toDate)
            };
        } else if (fromDate) {
            filter.issuedDate = { gte: new Date(fromDate) };
        } else if (toDate) {
            filter.issuedDate = { lte: new Date(toDate) };
        }

        return filter;
    }
}
