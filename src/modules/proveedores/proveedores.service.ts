import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ProveedoresService {
    private readonly logger = new Logger(ProveedoresService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Obtener todos los proveedores con información de deuda
     */
    async getAllProviders(search?: string) {
        const where = search
            ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' as const } },
                    { rut: { contains: search, mode: 'insensitive' as const } },
                ],
            }
            : {};

        const providers = await this.prisma.provider.findMany({
            where,
            include: {
                dtes: {
                    select: {
                        id: true,
                        folio: true,
                        totalAmount: true,
                        outstandingAmount: true,
                        paymentStatus: true,
                        issuedDate: true,
                    },
                },
                _count: {
                    select: {
                        dtes: true,
                        payments: true,
                    },
                },
            },
            orderBy: {
                name: 'asc',
            },
        });

        // Calcular métricas por proveedor
        return providers.map((provider) => {
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
    }

    /**
     * Obtener detalle de un proveedor específico
     */
    async getProviderDetail(providerId: string) {
        const provider = await this.prisma.provider.findUnique({
            where: { id: providerId },
            include: {
                dtes: {
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

    /**
     * Obtener top proveedores por deuda
     */
    async getTopProvidersByDebt(limit: number = 10) {
        const providers = await this.getAllProviders();

        return providers
            .sort((a, b) => b.totalDebt - a.totalDebt)
            .slice(0, limit);
    }
}
