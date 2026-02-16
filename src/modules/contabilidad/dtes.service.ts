import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface DteFilters {
    fromDate?: string;
    toDate?: string;
    providerId?: string;
    paymentStatus?: string;
    minAmount?: number;
    maxAmount?: number;
}

@Injectable()
export class DtesService {
    private readonly logger = new Logger(DtesService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Obtener todos los DTEs con filtros
     */
    async getAllDtes(filters: DteFilters = {}) {
        const where: any = {};

        if (filters.fromDate || filters.toDate) {
            where.issuedDate = {};
            if (filters.fromDate) {
                where.issuedDate.gte = new Date(filters.fromDate);
            }
            if (filters.toDate) {
                where.issuedDate.lte = new Date(filters.toDate);
            }
        }

        if (filters.providerId) {
            where.providerId = filters.providerId;
        }

        if (filters.paymentStatus) {
            where.paymentStatus = filters.paymentStatus;
        }

        if (filters.minAmount || filters.maxAmount) {
            where.totalAmount = {};
            if (filters.minAmount) {
                where.totalAmount.gte = filters.minAmount;
            }
            if (filters.maxAmount) {
                where.totalAmount.lte = filters.maxAmount;
            }
        }

        const dtes = await this.prisma.dTE.findMany({
            where,
            include: {
                provider: {
                    select: {
                        id: true,
                        rut: true,
                        name: true,
                        category: true,
                    },
                },
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
            orderBy: {
                issuedDate: 'desc',
            },
        });

        return dtes.map((dte) => ({
            ...dte,
            hasMatch: dte.matches.length > 0,
            matchCount: dte.matches.length,
        }));
    }

    /**
     * Obtener resumen de DTEs
     */
    async getDtesSummary(filters: DteFilters = {}) {
        const dtes = await this.getAllDtes(filters);

        const total = dtes.length;
        const totalAmount = dtes.reduce((sum, dte) => sum + dte.totalAmount, 0);
        const totalOutstanding = dtes.reduce(
            (sum, dte) => sum + dte.outstandingAmount,
            0
        );

        const byStatus = {
            UNPAID: dtes.filter((d) => d.paymentStatus === 'UNPAID').length,
            PARTIAL: dtes.filter((d) => d.paymentStatus === 'PARTIAL').length,
            PAID: dtes.filter((d) => d.paymentStatus === 'PAID').length,
            OVERPAID: dtes.filter((d) => d.paymentStatus === 'OVERPAID').length,
        };

        const byType = dtes.reduce((acc, dte) => {
            const typeKey = dte.type.toString();
            if (!acc[typeKey]) {
                acc[typeKey] = { count: 0, total: 0 };
            }
            acc[typeKey].count++;
            acc[typeKey].total += dte.totalAmount;
            return acc;
        }, {} as Record<string, { count: number; total: number }>);

        const matched = dtes.filter((d) => d.hasMatch).length;
        const unmatched = total - matched;

        return {
            total,
            totalAmount,
            totalOutstanding,
            paidAmount: totalAmount - totalOutstanding,
            paymentRate:
                totalAmount > 0
                    ? ((totalAmount - totalOutstanding) / totalAmount) * 100
                    : 0,
            byStatus,
            byType,
            matched,
            unmatched,
            matchRate: total > 0 ? (matched / total) * 100 : 0,
        };
    }

    /**
     * Obtener DTEs pendientes de pago
     */
    async getUnpaidDtes(limit: number = 50) {
        const dtes = await this.prisma.dTE.findMany({
            where: {
                paymentStatus: {
                    in: ['UNPAID', 'PARTIAL'],
                },
            },
            include: {
                provider: true,
            },
            orderBy: {
                outstandingAmount: 'desc',
            },
            take: limit,
        });

        return dtes;
    }

    /**
     * Obtener DTEs vencidos (más de 30 días sin pagar)
     */
    async getOverdueDtes() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dtes = await this.prisma.dTE.findMany({
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

        return dtes.map((dte) => {
            const daysSinceIssue = Math.floor(
                (Date.now() - new Date(dte.issuedDate).getTime()) /
                (1000 * 60 * 60 * 24)
            );
            return {
                ...dte,
                daysOverdue: daysSinceIssue,
            };
        });
    }
}
