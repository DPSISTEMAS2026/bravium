import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataVisibilityService } from '../../common/services/data-visibility.service';

@Injectable()
export class ReportesService {
    private readonly logger = new Logger(ReportesService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly visibility: DataVisibilityService,
    ) { }

    /**
     * Reporte de deuda por proveedor
     */
    async getDeudaPorProveedor(fromDate?: string, toDate?: string, organizationId?: string) {
        const where: any = {};
        if (organizationId) where.organizationId = organizationId;
        const minDate = this.visibility.applyMinDate(
            fromDate ? new Date(fromDate) : undefined,
        );

        if (minDate || toDate) {
            where.issuedDate = {};
            if (minDate) where.issuedDate.gte = minDate;
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
    async getFlujoCaja(fromDate?: string, toDate?: string, organizationId?: string) {
        const where: any = {};
        if (organizationId) where.bankAccount = { organizationId };
        const minDate = this.visibility.applyMinDate(
            fromDate ? new Date(fromDate) : undefined,
        );

        if (minDate || toDate) {
            where.date = {};
            if (minDate) where.date.gte = minDate;
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
    async getFacturasVencidas(organizationId?: string) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const minDate = this.visibility.getVisibleFromDate();

        const overdueInvoices = await this.prisma.dTE.findMany({
            where: {
                paymentStatus: {
                    in: ['UNPAID', 'PARTIAL'],
                },
                ...(organizationId && { organizationId }),
                issuedDate: {
                    lte: thirtyDaysAgo,
                    ...(minDate && { gte: minDate }),
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
    /**
     * Verifica el estado de match de una lista de folios para un mes/año dado
     */
    async verificarFolios(folios: number[], year: number, month: number, organizationId?: string) {
        const uniqueFolios = [...new Set(folios)].sort((a, b) => a - b);
        const fromDate = new Date(year, month - 1, 1);
        const toDate = new Date(year, month, 1);

        // Buscar DTEs en el mes indicado
        const dtes = await this.prisma.dTE.findMany({
            where: {
                folio: { in: uniqueFolios },
                issuedDate: { gte: fromDate, lt: toDate },
                ...(organizationId && { organizationId }),
            },
            include: {
                matches: {
                    select: {
                        id: true,
                        status: true,
                        origin: true,
                        confidence: true,
                        confirmedAt: true,
                        ruleApplied: true,
                    },
                },
                provider: { select: { name: true, rut: true } },
            },
            orderBy: { folio: 'asc' },
        });

        // Mapa de folios encontrados
        const foundMap = new Map<number, typeof dtes>();
        for (const dte of dtes) {
            if (!foundMap.has(dte.folio)) foundMap.set(dte.folio, []);
            foundMap.get(dte.folio)!.push(dte);
        }

        // Clasificar
        const withConfirmed: any[] = [];
        const withDraft: any[] = [];
        const withRejected: any[] = [];
        const noMatch: any[] = [];
        const notFoundFolios: number[] = [];

        for (const folio of uniqueFolios) {
            const dtesF = foundMap.get(folio);
            if (!dtesF || dtesF.length === 0) {
                notFoundFolios.push(folio);
                continue;
            }
            for (const dte of dtesF) {
                const confirmed = dte.matches.filter(m => m.status === 'CONFIRMED');
                const drafts = dte.matches.filter(m => m.status === 'DRAFT');
                const rejected = dte.matches.filter(m => m.status === 'REJECTED');

                const entry = {
                    folio: dte.folio,
                    type: dte.type,
                    totalAmount: dte.totalAmount,
                    paymentStatus: dte.paymentStatus,
                    issuedDate: dte.issuedDate,
                    provider: dte.provider?.name || dte.rutIssuer,
                    rut: dte.provider?.rut || dte.rutIssuer,
                    matchOrigin: confirmed[0]?.origin || drafts[0]?.origin || null,
                    matchRule: confirmed[0]?.ruleApplied || drafts[0]?.ruleApplied || null,
                    confidence: confirmed[0]?.confidence ?? drafts[0]?.confidence ?? null,
                };

                if (confirmed.length > 0) withConfirmed.push(entry);
                else if (drafts.length > 0) withDraft.push(entry);
                else if (rejected.length > 0) withRejected.push(entry);
                else noMatch.push(entry);
            }
        }

        // Para los no encontrados, buscar en otros meses
        let notFoundDetails: any[] = [];
        if (notFoundFolios.length > 0) {
            const elsewhere = await this.prisma.dTE.findMany({
                where: { folio: { in: notFoundFolios } },
                select: {
                    folio: true,
                    issuedDate: true,
                    type: true,
                    totalAmount: true,
                    paymentStatus: true,
                    provider: { select: { name: true, rut: true } },
                    matches: { select: { status: true } },
                },
                orderBy: { folio: 'asc' },
            });

            const elseMap = new Map<number, any[]>();
            for (const d of elsewhere) {
                if (!elseMap.has(d.folio)) elseMap.set(d.folio, []);
                elseMap.get(d.folio)!.push(d);
            }

            notFoundDetails = notFoundFolios.map(f => {
                const entries = elseMap.get(f);
                if (entries && entries.length > 0) {
                    return entries.map(e => ({
                        folio: f,
                        existsElsewhere: true,
                        issuedDate: e.issuedDate,
                        type: e.type,
                        totalAmount: e.totalAmount,
                        paymentStatus: e.paymentStatus,
                        provider: e.provider?.name || '?',
                        rut: e.provider?.rut || '',
                        matchStatuses: e.matches.map((m: any) => m.status),
                        hasConfirmedMatch: e.matches.some((m: any) => m.status === 'CONFIRMED'),
                    }));
                }
                return [{ folio: f, existsElsewhere: false }];
            }).flat();
        }

        return {
            period: `${year}-${String(month).padStart(2, '0')}`,
            totalFoliosRequested: uniqueFolios.length,
            foundInMonth: dtes.length,
            summary: {
                confirmed: withConfirmed.length,
                draft: withDraft.length,
                rejected: withRejected.length,
                noMatch: noMatch.length,
                notFoundInMonth: notFoundFolios.length,
            },
            withConfirmed,
            withDraft,
            withRejected,
            noMatch,
            notFoundDetails,
        };
    }
}
