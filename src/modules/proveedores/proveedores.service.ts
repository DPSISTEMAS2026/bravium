import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataVisibilityService } from '../../common/services/data-visibility.service';

/** Fecha mínima por defecto para listado e informes de proveedores: solo 2026 (LibreDTE vs cartolas). */
const DEFAULT_REPORT_FROM = new Date('2026-01-01');

@Injectable()
export class ProveedoresService {
    private readonly logger = new Logger(ProveedoresService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly visibility: DataVisibilityService,
    ) { }

    private getMinDate(): Date | null {
        return this.visibility.getVisibleFromDate() ?? DEFAULT_REPORT_FROM;
    }

    /** Tamaño de página por defecto para listado de proveedores */
    private static readonly DEFAULT_PAGE_SIZE = 20;

    /**
     * Obtener proveedores con información de deuda (paginado)
     */
    async getAllProviders(search?: string, page: number = 1, limit: number = ProveedoresService.DEFAULT_PAGE_SIZE, organizationId?: string, year?: string, statusFilter?: string, month?: string) {
        const where: any = search
            ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' as const } },
                    { rut: { contains: search, mode: 'insensitive' as const } },
                ],
            }
            : {};
        if (organizationId) {
            where.organizationId = organizationId;
        }
 
        let minDate = this.getMinDate();
        let maxDate: Date | undefined = undefined;
 
        if (year && month && month !== 'ALL') {
            const m = parseInt(month, 10);
            minDate = new Date(parseInt(year, 10), m - 1, 1);
            maxDate = new Date(parseInt(year, 10), m, 0, 23, 59, 59, 999);
        } else if (year) {
            minDate = new Date(`${year}-01-01`);
            maxDate = new Date(`${year}-12-31T23:59:59.999Z`);
        }

        const skip = Math.max(0, (page - 1) * limit);
        const take = Math.min(100, Math.max(1, limit));

        const dteFilter: any = {};
        if (minDate) dteFilter.gte = minDate;
        if (maxDate) dteFilter.lte = maxDate;

        // Si hay un filtro de estado, debemos traer todos para calcular las métricas antes de paginar en memoria
        const applyTakeSkip = !statusFilter || statusFilter === 'ALL';

        const [providers, dbTotal] = await Promise.all([
            this.prisma.provider.findMany({
                where,
                skip: applyTakeSkip ? skip : undefined,
                take: applyTakeSkip ? take : undefined,
                include: {
                    dtes: {
                        where: Object.keys(dteFilter).length > 0 ? { issuedDate: dteFilter } : undefined,
                        select: {
                            id: true,
                            folio: true,
                            totalAmount: true,
                            outstandingAmount: true,
                            paymentStatus: true,
                            issuedDate: true,
                            dueDate: true,
                        },
                    },
                    _count: {
                        select: {
                            dtes: Object.keys(dteFilter).length > 0 ? { where: { issuedDate: dteFilter } } : true,
                            payments: true,
                        },
                    },
                },
                orderBy: {
                    name: 'asc',
                },
            }),
            this.prisma.provider.count({ where }),
        ]);

        // Calcular métricas por proveedor
        let data = providers.map((provider) => {
            const totalDebt = provider.dtes.reduce(
                (sum, dte) => sum + dte.outstandingAmount,
                0
            );
            const totalInvoiced = provider.dtes.reduce(
                (sum, dte) => sum + dte.totalAmount,
                0
            );
            const paidAmount = totalInvoiced - totalDebt;

            const unpaidDtes = provider.dtes.filter(
                (dte) => dte.outstandingAmount > 0
            ).length;

            const overdueInvoices10 = provider.dtes.filter((dte) => {
                const days = (Date.now() - new Date(dte.issuedDate).getTime()) / 86400000;
                return dte.outstandingAmount > 0 && days > 10;
            }).length;

            const overdueInvoices30 = provider.dtes.filter((dte) => {
                const days = (Date.now() - new Date(dte.issuedDate).getTime()) / 86400000;
                return dte.outstandingAmount > 0 && days > 30;
            }).length;

            const overdueInvoices = overdueInvoices30; // Para mantener compatibilidad si se usa en otro lado

            // Categoría/Estado para el filtro
            let status = 'OK';
            if (overdueInvoices30 > 0) status = 'CRITICAL_30';
            else if (overdueInvoices10 > 0) status = 'CRITICAL_10';
            else if (totalDebt > 0) status = 'WITH_DEBT';

            return {
                id: provider.id,
                rut: provider.rut,
                name: provider.name,
                category: provider.category,
                totalDebt,
                totalInvoiced,
                paidAmount,
                paymentRate:
                    totalInvoiced > 0
                        ? ((paidAmount / totalInvoiced) * 100).toFixed(1)
                        : '0.0',
                invoiceCount: provider._count.dtes,
                paymentCount: provider._count.payments,
                unpaidInvoices: unpaidDtes,
                overdueInvoices: overdueInvoices10 > 0 ? overdueInvoices10 : overdueInvoices30,
                status,
                createdAt: provider.createdAt,
                updatedAt: provider.updatedAt,
            };
        });

        // Aplicar filtro de estado en memoria si se requiere
        if (statusFilter && statusFilter !== 'ALL') {
            if (statusFilter === 'PENDING') {
                data = data.filter((p) => p.totalDebt > 0);
            } else {
                data = data.filter((p) => p.status === statusFilter);
            }
        }

        // Paginación en memoria si no se usó skip/take de Prisma
        const total = applyTakeSkip ? dbTotal : data.length;
        if (!applyTakeSkip) {
            data = data.slice(skip, skip + take);
        }

        const totalPages = Math.ceil(total / take);
        return {
            data,
            total,
            page,
            limit: take,
            totalPages,
        };
    }

    /**
     * Obtener detalle de un proveedor específico
     */
    async getProviderDetail(providerId: string, organizationId?: string) {
        const minDate = this.getMinDate();
        const provider = await this.prisma.provider.findFirst({
            where: { id: providerId, ...(organizationId ? { organizationId } : {}) },
            include: {
                dtes: {
                    where: minDate ? { issuedDate: { gte: minDate } } : undefined,
                    orderBy: { issuedDate: 'desc' },
                    include: {
                        matches: {
                            include: {
                                transaction: {
                                    include: {
                                        bankAccount: true,
                                    },
                                },
                            },
                        },
                    },
                },
                payments: {
                    orderBy: { paymentDate: 'desc' },
                },
                ledgerEntries: {
                    orderBy: { transactionDate: 'desc' },
                    take: 50,
                },
            },
        });

        if (!provider) {
            throw new Error('Proveedor no encontrado');
        }

        // Obtener movimientos bancarios asociados por alias/revisión manual
        const aliasMovements = await this.prisma.bankTransaction.findMany({
            where: {
                metadata: {
                    path: ['providerId'],
                    equals: providerId
                }
            },
            include: { bankAccount: true },
            orderBy: { date: 'desc' },
            take: 100
        });

        const totalDebt = provider.dtes.reduce(
            (sum, dte) => sum + dte.outstandingAmount,
            0
        );
        const totalInvoiced = provider.dtes.reduce(
            (sum, dte) => sum + dte.totalAmount,
            0
        );

        return {
            ...provider,
            aliasMovements,
            metrics: {
                totalDebt,
                totalInvoiced,
                paidAmount: totalInvoiced - totalDebt,
                invoiceCount: provider.dtes.length,
                paymentCount: provider.payments.length,
            },
        };
    }

    async updateProvider(providerId: string, data: {
        transferBankName?: string;
        transferAccountNumber?: string;
        transferAccountType?: string;
        transferRut?: string;
        transferEmail?: string;
    }) {
        return this.prisma.provider.update({
            where: { id: providerId },
            data,
        });
    }

    /**
     * Obtener top proveedores por deuda (usa una página amplia para ordenar por deuda)
     */
    async getTopProvidersByDebt(limit: number = 10, organizationId?: string) {
        const { data } = await this.getAllProviders(undefined, 1, Math.max(500, limit), organizationId);

        return data
            .sort((a, b) => b.totalDebt - a.totalDebt)
            .slice(0, limit);
    }
}
