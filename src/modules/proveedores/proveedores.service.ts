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
    async getAllProviders(search?: string, page: number = 1, limit: number = ProveedoresService.DEFAULT_PAGE_SIZE) {
        const where = search
            ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' as const } },
                    { rut: { contains: search, mode: 'insensitive' as const } },
                ],
            }
            : {};

        const minDate = this.getMinDate();
        const skip = Math.max(0, (page - 1) * limit);
        const take = Math.min(100, Math.max(1, limit));

        const [providers, total] = await Promise.all([
            this.prisma.provider.findMany({
                where,
                skip,
                take,
                include: {
                    dtes: {
                        where: minDate ? { issuedDate: { gte: minDate } } : undefined,
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
                            dtes: minDate ? { where: { issuedDate: { gte: minDate } } } : true,
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
        const data = providers.map((provider) => {
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
                (dte) => dte.paymentStatus === 'UNPAID'
            ).length;

            const overdueInvoices = provider.dtes.filter((dte) => {
                const daysSinceIssue =
                    (Date.now() - new Date(dte.issuedDate).getTime()) /
                    (1000 * 60 * 60 * 24);
                return dte.paymentStatus === 'UNPAID' && daysSinceIssue > 30;
            }).length;

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
                overdueInvoices,
                status:
                    overdueInvoices > 0
                        ? 'CRITICAL'
                        : totalDebt > 0
                            ? 'WARNING'
                            : 'OK',
                createdAt: provider.createdAt,
                updatedAt: provider.updatedAt,
            };
        });

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
    async getProviderDetail(providerId: string) {
        const minDate = this.getMinDate();
        const provider = await this.prisma.provider.findUnique({
            where: { id: providerId },
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
    async getTopProvidersByDebt(limit: number = 10) {
        const { data } = await this.getAllProviders(undefined, 1, Math.max(500, limit));

        return data
            .sort((a, b) => b.totalDebt - a.totalDebt)
            .slice(0, limit);
    }
}
