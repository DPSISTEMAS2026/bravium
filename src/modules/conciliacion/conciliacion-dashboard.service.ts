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
            if (fromDate && isNaN(Date.parse(fromDate))) {
                this.logger.warn(`Invalid fromDate: ${fromDate}`);
                fromDate = undefined;
            }
            if (toDate && isNaN(Date.parse(toDate))) {
                this.logger.warn(`Invalid toDate: ${toDate}`);
                toDate = undefined;
            }
            if (!fromDate) fromDate = '2026-01-01';
            filters = { ...filters, fromDate, toDate };
            this.logger.log(`Getting dashboard for period: ${fromDate} to ${toDate || 'open'}`);

            // Defaults in case of failure
            const defaultTransactionStats = { total: 0, matched: 0, pending: 0, match_rate: '0%', total_amount: 0 };
            const defaultDteStats = { total: 0, paid: 0, unpaid: 0, partially_paid: 0, payment_rate: '0%', total_amount: 0, outstanding_amount: 0 };
            const defaultMatchStats = { total: 0, confirmed: 0, draft: 0, automatic: 0, manual: 0, auto_rate: '0%' };

            const [
                transactionStats,
                dteStats,
                matchStats,
                pendingTransactions,
                pendingDtes,
                recentMatches,
                topProviders,
                unmatchedHighValue,
                monthlyBreakdown
            ] = await Promise.all([
                this.safeRun(() => this.getTransactionStats(filters), defaultTransactionStats, 'TransactionStats'),
                this.safeRun(() => this.getDteStats(filters), defaultDteStats, 'DteStats'),
                this.safeRun(() => this.getMatchStats(filters), defaultMatchStats, 'MatchStats'),
                this.safeRun(() => this.getPendingTransactions(filters, 20), [], 'PendingTransactions'),
                this.safeRun(() => this.getPendingDtes(filters, 20), [], 'PendingDtes'),
                this.safeRun(() => this.getRecentMatches(filters, 50), [], 'RecentMatches'),
                this.safeRun(() => this.getTopProviders(filters, 10), [], 'TopProviders'),
                this.safeRun(() => this.getUnmatchedHighValue(filters, 10), { transactions: [], dtes: [] }, 'UnmatchedHighValue'),
                this.safeRun(() => this.getMonthlyBreakdown(filters), [], 'MonthlyBreakdown')
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
                monthly_breakdown: monthlyBreakdown,
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
     * Resumen Mensual
     */
    private async getMonthlyBreakdown(filters: DashboardFiltersDto) {
        const fromDateObj = filters.fromDate ? new Date(filters.fromDate) : new Date('2026-01-01T00:00:00.000Z');
        const toDateObj = filters.toDate ? new Date(filters.toDate) : new Date();
        
        // Generar lista de meses a iterar
        const months = [];
        let cur = new Date(fromDateObj.getFullYear(), fromDateObj.getMonth(), 1);
        
        while (cur <= toDateObj) {
            const numMonth = cur.getMonth();
            const start = new Date(cur.getFullYear(), cur.getMonth(), 1);
            const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 0); // last day
            
            months.push({
                name: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][numMonth],
                year: cur.getFullYear(),
                start, end
            });
            cur.setMonth(cur.getMonth() + 1);
        }

        const breakdown = [];
        for (const m of months) {
            const mFilters: DashboardFiltersDto = { ...filters, fromDate: m.start.toISOString(), toDate: m.end.toISOString() };
            const [dtes, txs] = await Promise.all([
                this.getDteStats(mFilters),
                this.getTransactionStats(mFilters)
            ]);
            breakdown.push({
                month: m.name,
                year: m.year,
                dtes,
                transactions: txs
            });
        }
        return breakdown;
    }

    /**
     * Estadísticas de DTEs
     */
    private async getDteStats(filters: DashboardFiltersDto) {
        const dateFilter = {
            ...this.buildDteDateFilter(filters),
            type: { not: 61 },
        };

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
                paymentStatus: 'UNPAID',
                type: { not: 61 },
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
                        issuedDate: true,
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

    /**
     * Resumen agrupado de cartolas por Proveedor / RUT / Patrón Recurrente
     */
    async getGroupedSummary(filters: DashboardFiltersDto = {}) {
        const txWhere = this.buildTransactionDateFilter(filters);
        txWhere.status = { in: ['PENDING', 'PARTIALLY_MATCHED'] };
        txWhere.type = 'DEBIT';

        const [txs, allProviders, allUnpaidDtes] = await Promise.all([
            this.prisma.bankTransaction.findMany({
                where: txWhere,
                orderBy: { date: 'desc' },
                include: {
                    bankAccount: { select: { bankName: true, accountNumber: true } },
                    matches: { select: { id: true, dteId: true, status: true, ruleApplied: true } },
                },
            }),
            this.prisma.provider.findMany({
                where: filters.organizationId ? { organizationId: filters.organizationId } : {},
                select: { id: true, name: true, rut: true },
            }),
            this.prisma.dTE.findMany({
                where: {
                    paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
                    type: { not: 61 },
                    ...this.buildDteDateFilter(filters),
                    ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
                },
                include: {
                    provider: { select: { id: true, name: true, rut: true } },
                    matches: { select: { id: true, transactionId: true, status: true, ruleApplied: true } },
                },
                orderBy: { issuedDate: 'desc' },
            }),
        ]);

        // Helper para extraer RUT
        const extractRut = (desc: string): string | null => {
            if (!desc) return null;
            const m1 = desc.match(/(\d{1,2}(?:\.?\d{3}){2}-?[\dkK])\b/i);
            if (m1) {
                const clean = m1[1].replace(/\./g, '').replace(/-/g, '').toUpperCase();
                return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
            }
            const m2 = desc.match(/\b0?(\d{7,8})(\d)\b/);
            if (m2) return `${m2[1]}-${m2[2]}`;
            return null;
        };

        // Índice de proveedores por RUT limpio (soporta RUT con y sin DV)
        const provByRutMap = new Map<string, { id: string; name: string; rut: string }>();
        for (const p of allProviders) {
            if (!p.rut) continue;
            const rutKey = p.rut.replace(/\./g, '').replace(/-/g, '').toUpperCase();
            provByRutMap.set(rutKey, p);
            if (rutKey.length >= 8) provByRutMap.set(rutKey.slice(0, 8), p);
            if (rutKey.length >= 7) provByRutMap.set(rutKey.slice(0, 7), p);
        }

        // Map de DTEs por providerId y por RUT (soporta RUT completo y cuerpo sin DV)
        const dtesByProvId = new Map<string, any[]>();
        const dtesByRutKey = new Map<string, any[]>();

        const addDteToRutKey = (key: string, dte: any) => {
            if (!key) return;
            const clean = key.replace(/[^0-9Kk]/g, '').toUpperCase();
            if (!clean) return;

            const targetKeys = new Set<string>([clean]);
            if (clean.length >= 8) targetKeys.add(clean.slice(0, 8));
            if (clean.length >= 7) targetKeys.add(clean.slice(0, 7));

            for (const k of targetKeys) {
                if (!dtesByRutKey.has(k)) dtesByRutKey.set(k, []);
                const arr = dtesByRutKey.get(k)!;
                if (!arr.some(d => d.id === dte.id)) {
                    arr.push(dte);
                }
            }
        };

        for (const dte of allUnpaidDtes) {
            if (dte.providerId) {
                if (!dtesByProvId.has(dte.providerId)) dtesByProvId.set(dte.providerId, []);
                const arr = dtesByProvId.get(dte.providerId)!;
                if (!arr.some(d => d.id === dte.id)) arr.push(dte);
            }
            if (dte.provider?.rut) addDteToRutKey(dte.provider.rut, dte);
            if (dte.rutIssuer) addDteToRutKey(dte.rutIssuer, dte);
        }

        // Agrupar transacciones
        const groupsMap = new Map<string, {
            groupId: string;
            groupName: string;
            rut: string | null;
            provider: { id: string; name: string; rut: string } | null;
            transactions: any[];
            totalAmount: number;
        }>();

        for (const tx of txs) {
            const metaRut = (tx.metadata as any)?.providerRut;
            const descRut = extractRut(tx.description || '');
            const rawRut = metaRut || descRut;
            const rutKey = rawRut ? rawRut.replace(/\./g, '').replace(/-/g, '').toUpperCase() : null;

            let provider = rutKey ? (provByRutMap.get(rutKey) || null) : null;
            if (!provider && rutKey) {
                const clean = rutKey.replace(/[^0-9Kk]/g, '').toUpperCase();
                const dtes = dtesByRutKey.get(clean) || dtesByRutKey.get(clean.slice(0, 8)) || dtesByRutKey.get(clean.slice(0, 7)) || [];
                if (dtes.length > 0 && dtes[0].provider) {
                    provider = dtes[0].provider;
                }
            }

            let groupKey: string;
            let groupName: string;

            if (provider) {
                groupKey = `PROV_${provider.id || provider.rut}`;
                groupName = provider.name;
            } else if (rawRut) {
                const clean = rutKey ? rutKey.replace(/[^0-9Kk]/g, '').toUpperCase() : '';
                const dtes = dtesByRutKey.get(clean) || dtesByRutKey.get(clean.slice(0, 8)) || dtesByRutKey.get(clean.slice(0, 7)) || [];
                const dteProvName = dtes[0]?.provider?.name;
                groupKey = `RUT_${rutKey}`;
                groupName = dteProvName || `Transferencias a RUT ${rawRut}`;
            } else {
                // Normalizar glosa para agrupar patrones recurrentes
                const normDesc = (tx.description || '')
                    .toLowerCase()
                    .replace(/[\d.,\-()]/g, ' ')
                    .split(/\s+/)
                    .filter(w => w.length > 2)
                    .slice(0, 4)
                    .join(' ')
                    .trim() || 'Movimientos Varios';

                groupKey = `GLOSA_${normDesc}`;
                groupName = (tx.description || 'Movimientos sin detalle').slice(0, 45);
            }

            if (!groupsMap.has(groupKey)) {
                groupsMap.set(groupKey, {
                    groupId: groupKey,
                    groupName,
                    rut: provider?.rut || rawRut || null,
                    provider,
                    transactions: [],
                    totalAmount: 0,
                });
            }

            const grp = groupsMap.get(groupKey)!;
            grp.transactions.push(tx);
            grp.totalAmount += Math.abs(tx.amount);
        }

        // Enriquecer cada grupo con sus DTEs correspondientes
        const groups = Array.from(groupsMap.values()).map(grp => {
            let rawDtes: any[] = [];
            if (grp.provider?.id) {
                rawDtes = dtesByProvId.get(grp.provider.id) || [];
            }
            if (rawDtes.length === 0 && grp.rut) {
                const clean = grp.rut.replace(/[^0-9Kk]/g, '').toUpperCase();
                const body8 = clean.slice(0, 8);
                const body7 = clean.slice(0, 7);
                rawDtes = dtesByRutKey.get(clean) || dtesByRutKey.get(body8) || dtesByRutKey.get(body7) || [];
            }

            // Deduplicar estrictamente DTEs por ID
            const dteMap = new Map<string, any>();
            for (const d of rawDtes) {
                if (d && d.id) dteMap.set(d.id, d);
            }
            const pendingDtes = Array.from(dteMap.values());

            const pendingDteTotal = pendingDtes.reduce((sum, d) => sum + Math.abs(d.totalAmount || 0), 0);

            return {
                ...grp,
                transactionCount: grp.transactions.length,
                pendingDtes,
                pendingDteCount: pendingDtes.length,
                pendingDteTotal,
            };
        });

        // Ordenar: PRIMERO los grupos que tienen TANTO transferencias COMO DTEs disponibles
        groups.sort((a, b) => {
            const aHasBoth = a.transactionCount > 0 && a.pendingDteCount > 0;
            const bHasBoth = b.transactionCount > 0 && b.pendingDteCount > 0;

            if (aHasBoth && !bHasBoth) return -1;
            if (!aHasBoth && bHasBoth) return 1;

            // Si ambos tienen DTEs y transferencias (o ninguno), ordenar por mayor cantidad de DTEs pendientes
            if (b.pendingDteCount !== a.pendingDteCount) {
                return b.pendingDteCount - a.pendingDteCount;
            }

            // Luego por mayor monto total en cartola
            return b.totalAmount - a.totalAmount;
        });

        return {
            totalPendingTransactions: txs.length,
            totalGroups: groups.length,
            groups,
        };
    }
}
