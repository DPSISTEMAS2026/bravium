import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import { DataVisibilityService } from '../../common/services/data-visibility.service';

export interface DteFilters {
    organizationId?: string;
    fromDate?: string;
    toDate?: string;
    providerId?: string;
    paymentStatus?: string;
    minAmount?: number;
    maxAmount?: number;
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    hasPdf?: string; // 'ALL' | 'YES' | 'NO'
    includeMatched?: boolean; // When true, don't filter out already-matched DTEs
    type?: number;
}

const CACHE_TTL = 30_000;

@Injectable()
export class DtesService {
    private readonly logger = new Logger(DtesService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly cache: CacheService,
        private readonly visibility: DataVisibilityService,
    ) { }

    private buildWhere(filters: DteFilters) {
        const where: any = {};

        if (filters.organizationId) {
            where.organizationId = filters.organizationId;
        }

        const minDate = filters.search
            ? (filters.fromDate ? new Date(filters.fromDate) : undefined)
            : this.visibility.applyMinDate(filters.fromDate ? new Date(filters.fromDate) : undefined);

        if (minDate || filters.toDate) {
            where.issuedDate = {};
            if (minDate) where.issuedDate.gte = minDate;
            if (filters.toDate) where.issuedDate.lte = new Date(filters.toDate);
        }

        if (filters.providerId) {
            where.providerId = filters.providerId;
        }

        if (filters.type !== undefined) {
            where.type = filters.type;
        } else if (filters.paymentStatus === 'ABONOS') {
            // Filtro especial compatibilad: solo Notas de Crédito (tipo 61)
            where.type = 61;
        } else if (filters.paymentStatus === 'UNPAID_OR_ABONOS') {
            // Incluir tanto facturas pendientes como Notas de Crédito (que nacen PAID)
            where.OR = [
                { type: { not: 61 }, paymentStatus: 'UNPAID' },
                { type: 61 }
            ];
        } else if (filters.includeMatched) {
            // Cuando se busca para reasignar (modal de conciliación), incluir también NCs
            // que no tengan match CONFIRMED (aunque estén marcadas PAID sin match real)
            where.OR = [
                { type: { not: 61 } },
                { type: 61, matches: { none: { status: 'CONFIRMED' } } },
            ];
        } else {
            // Excluir Notas de Crédito del listado normal (son abonos, no deudas)
            where.type = { not: 61 };
        }

        if (filters.paymentStatus && filters.paymentStatus !== 'ALL' && filters.paymentStatus !== 'ABONOS' && filters.paymentStatus !== 'UNPAID_OR_ABONOS') {
            where.paymentStatus = filters.paymentStatus;
        }

        // Pendientes = solo DTEs sin match CONFIRMED (aceptado en Cartolas)
        // Unless includeMatched is true (used when reassigning DTEs)
        if (!filters.includeMatched && (filters.paymentStatus === 'UNPAID' || filters.paymentStatus === 'ABONOS' || filters.paymentStatus === 'UNPAID_OR_ABONOS' || filters.type === 61)) {
            where.matches = { none: { status: 'CONFIRMED' } };
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

        if (filters.hasPdf && filters.hasPdf !== 'ALL') {
            if (filters.hasPdf === 'YES') {
                where.metadata = { path: ['intercambio'], not: null };
            } else if (filters.hasPdf === 'NO') {
                where.OR = [
                    { metadata: { equals: null } },
                    { metadata: { path: ['intercambio'], equals: null } },
                ];
            }
        }

        if (filters.search && filters.search.trim()) {
            const raw = filters.search.trim();
            const digitsOnly = raw.replace(/\D/g, '');
            const folioNum = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
            const amountNum = digitsOnly.length >= 2 ? parseInt(digitsOnly, 10) : NaN;

            const orConditions: any[] = [
                { rutIssuer: { contains: raw } },
                {
                    provider: {
                        OR: [
                            { name: { contains: raw, mode: 'insensitive' } },
                            { rut: { contains: raw } },
                            ...(digitsOnly.length >= 6 ? [{ rut: { contains: digitsOnly } }] : []),
                        ],
                    },
                },
            ];
            if (!isNaN(folioNum)) orConditions.push({ folio: folioNum });
            if (!isNaN(amountNum) && amountNum > 0) orConditions.push({ totalAmount: amountNum });
            
            if (where.OR) {
                where.AND = [{ OR: where.OR }, { OR: orConditions }];
                delete where.OR;
            } else {
                where.OR = orConditions;
            }
        }

        return where;
    }

    /**
     * Obtener todos los DTEs con filtros (soporta paginación)
     */
    async getAllDtes(filters: DteFilters = {}) {
        let where = this.buildWhere(filters);
        if (filters.search && filters.search.trim()) {
            const digitsOnly = filters.search.trim().replace(/\D/g, '');
            if (digitsOnly.length >= 6) {
                const rutMatchIds = await this.prisma.$queryRaw<{ id: string }[]>`
                    SELECT d.id FROM dtes d
                    LEFT JOIN providers p ON d."providerId" = p.id
                    WHERE regexp_replace(COALESCE(d."rutIssuer", ''), '[^0-9]', '', 'g') LIKE '%' || ${digitsOnly} || '%'
                       OR (p.id IS NOT NULL AND regexp_replace(COALESCE(p.rut, ''), '[^0-9]', '', 'g') LIKE '%' || ${digitsOnly} || '%')
                `;
                const ids = rutMatchIds.map((r) => r.id);
                if (ids.length > 0) {
                    where = { ...where, OR: [...((where.OR as any[]) || []), { id: { in: ids } }] };
                }
            }
        }
        const page = filters.page ? parseInt(filters.page.toString(), 10) : undefined;
        const limit = filters.limit ? parseInt(filters.limit.toString(), 10) : undefined;

        let orderBy: any = { folio: 'desc' };
        if (filters.sortBy) {
            const order = filters.sortOrder || 'asc';
            if (filters.sortBy === 'folio') orderBy = { folio: order };
            else if (filters.sortBy === 'totalAmount') orderBy = { totalAmount: order };
            else if (filters.sortBy === 'issuedDate') orderBy = { issuedDate: order };
        }

        const [total, dtes] = await Promise.all([
            this.prisma.dTE.count({ where }),
            this.prisma.dTE.findMany({
                where,
                include: {
                    provider: { select: { id: true, rut: true, name: true, category: true } },
                    matches: {
                        include: {
                            transaction: {
                                select: {
                                    id: true, description: true, date: true, amount: true, type: true,
                                    bankAccount: { select: { bankName: true, accountNumber: true } },
                                },
                            },
                        },
                    },
                },
                orderBy,
                skip: page && limit ? (page - 1) * limit : undefined,
                take: limit,
            }),
        ]);

        // Solo consideramos "conciliado" si tiene al menos un match CONFIRMED (aceptado en Cartolas)
        const data = dtes.map((dte) => {
            const confirmedMatches = dte.matches.filter((m: { status: string }) => m.status === 'CONFIRMED');
            const hasConfirmedMatch = confirmedMatches.length > 0;
            return {
                ...dte,
                matches: confirmedMatches.length > 0 ? confirmedMatches : dte.matches,
                hasMatch: hasConfirmedMatch,
                matchCount: confirmedMatches.length,
                isPdfAvailable: dte.metadata && (dte.metadata as any).intercambio !== null,
            };
        });

        if (page && limit) {
            return {
                data,
                meta: { total, page, limit, lastPage: Math.ceil(total / limit) },
            };
        }
        return data;
    }

    /**
     * Obtener resumen de DTEs
     */
    async getDtesSummary(filters: DteFilters = {}) {
        const cacheKey = `dte-summary:${JSON.stringify(filters)}`;
        return this.cache.getOrFetch(cacheKey, CACHE_TTL, async () => {
            const where = this.buildWhere(filters);
            // Siempre excluir NC del resumen (son abonos, no deudas)
            where.type = { not: 61 };

            const [agg, statusGroups, typeGroups, dtesWithMatchCount] = await Promise.all([
                this.prisma.dTE.aggregate({
                    where,
                    _count: true,
                    _sum: { totalAmount: true, outstandingAmount: true },
                }),
                this.prisma.dTE.groupBy({
                    by: ['paymentStatus'],
                    where,
                    _count: true,
                }),
                this.prisma.dTE.groupBy({
                    by: ['type'],
                    where,
                    _count: true,
                    _sum: { totalAmount: true },
                }),
                this.prisma.dTE.count({
                    where: {
                        ...where,
                        matches: { some: { status: 'CONFIRMED' } },
                    },
                }),
            ]);

            const total = agg._count;
            const totalAmount = agg._sum.totalAmount || 0;
            const totalOutstanding = agg._sum.outstandingAmount || 0;

            const byStatus = { UNPAID: 0, PARTIAL: 0, PAID: 0, OVERPAID: 0 };
            for (const g of statusGroups) {
                if (g.paymentStatus in byStatus) byStatus[g.paymentStatus] = g._count;
            }

            const byType: Record<string, { count: number; total: number }> = {};
            for (const g of typeGroups) {
                byType[g.type.toString()] = { count: g._count, total: g._sum.totalAmount || 0 };
            }

            // Conciliados = DTEs del período con al menos un match CONFIRMED (siempre ≤ total)
            const matched = dtesWithMatchCount;
            const unmatched = total - matched;

            return {
                total,
                totalAmount,
                totalOutstanding,
                paidAmount: totalAmount - totalOutstanding,
                paymentRate: totalAmount > 0 ? ((totalAmount - totalOutstanding) / totalAmount) * 100 : 0,
                byStatus,
                byType,
                matched,
                unmatched,
                matchRate: total > 0 ? (matched / total) * 100 : 0,
            };
        });
    }

    /**
     * Lista de movimientos conciliados en el período (una fila por match = mismo número que Cartolas).
     * Para mostrar en Facturas cuando el usuario filtra por "Pagadas".
     */
    async getConciliatedMatchesInPeriod(filters: DteFilters = {}) {
        const minDate = this.visibility.applyMinDate(
            filters.fromDate ? new Date(filters.fromDate) : undefined,
        );
        const from = minDate ?? (filters.fromDate ? new Date(filters.fromDate) : undefined);
        const to = filters.toDate ? new Date(filters.toDate) : undefined;
        if (!from || !to) {
            return { data: [], meta: { total: 0, page: 1, limit: 15, lastPage: 0 } };
        }

        const matchWhere: any = {
            status: 'CONFIRMED',
            dteId: { not: null },
            transaction: { date: { gte: from, lte: to } },
        };

        if (filters.organizationId) {
            matchWhere.organizationId = filters.organizationId;
        }

        const page = filters.page ? Math.max(1, filters.page) : 1;
        const limit = Math.min(100, Math.max(1, filters.limit ?? 15));
        const skip = (page - 1) * limit;

        const [total, matches] = await Promise.all([
            this.prisma.reconciliationMatch.count({
                where: matchWhere,
            }),
            this.prisma.reconciliationMatch.findMany({
                where: matchWhere,
                skip,
                take: limit,
                orderBy: { transaction: { date: 'desc' } },
                include: {
                    transaction: {
                        select: {
                            id: true,
                            date: true,
                            amount: true,
                            description: true,
                            type: true,
                            bankAccount: { select: { bankName: true, accountNumber: true } },
                        },
                    },
                    payment: {
                        select: {
                            id: true,
                            amount: true,
                            paymentDate: true,
                        }
                    },
                    dte: {
                        include: {
                            provider: { select: { id: true, rut: true, name: true } },
                        },
                    },
                },
            }),
        ]);

        const data = matches
            .filter((m) => m.dte)
            .map((m) => ({
                id: m.id,
                matchId: m.id,
                transaction: m.transaction,
                payment: m.payment,
                dte: m.dte!,
                hasMatch: true,
                matchCount: 1,
            }));

        return {
            data,
            meta: {
                total,
                page,
                limit,
                lastPage: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Obtener DTEs pendientes de pago
     */
    async getUnpaidDtes(organizationId?: string, limit: number = 50) {
        const minDate = this.visibility.getVisibleFromDate();
        const dtes = await this.prisma.dTE.findMany({
            where: {
                ...(organizationId && { organizationId }),
                type: { not: 61 }, // Excluir NC (son abonos)
                paymentStatus: {
                    in: ['UNPAID', 'PARTIAL'],
                },
                ...(minDate && { issuedDate: { gte: minDate } }),
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
    async getOverdueDtes(organizationId?: string) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const minDate = this.visibility.getVisibleFromDate();

        const dtes = await this.prisma.dTE.findMany({
            where: {
                ...(organizationId && { organizationId }),
                type: { not: 61 }, // Excluir NC (son abonos)
                paymentStatus: {
                    in: ['UNPAID', 'PARTIAL'],
                },
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

    /**
     * Obtener un DTE por su ID, validando que pertenezca a la organización.
     */
    async getDteById(id: string, organizationId?: string) {
        const where: any = { id };
        if (organizationId) where.organizationId = organizationId;
        
        return this.prisma.dTE.findFirst({
            where,
            include: { provider: true },
        });
    }

    /**
     * Crear una boleta de honorarios (tipo 112) o boleta electrónica (tipo 39).
     * Si no hay providerId, crea o reutiliza un perfil con categoría HONORARIOS.
     */
    async createBoletaHonorarios(organizationId: string | undefined, data: {
        providerId?: string;
        providerName?: string;
        providerRut?: string;
        folio: number;
        amount: number;
        date?: string;
        notes?: string;
        type?: number;
    }) {
        if (!organizationId) throw new Error('Missing organizationId');
        if (!data.folio || !data.amount) throw new Error('Folio y monto son requeridos');

        const dteType = data.type === 39 || data.type === 41 ? data.type : 112;

        let provider = data.providerId
            ? await this.prisma.provider.findFirst({ where: { id: data.providerId, organizationId } })
            : null;

        if (!provider && data.providerName) {
            provider = await this.prisma.provider.findFirst({
                where: {
                    organizationId,
                    name: { equals: data.providerName.trim(), mode: 'insensitive' },
                },
            });
        }

        if (!provider && data.providerRut) {
            provider = await this.prisma.provider.findFirst({
                where: { organizationId, rut: data.providerRut },
            });
        }

        if (!provider) {
            const name = (data.providerName || '').trim();
            if (!name) throw new Error('Se requiere un proveedor o el nombre del trabajador a honorarios');
            const slug = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 16).toUpperCase() || 'HON';
            provider = await this.prisma.provider.create({
                data: {
                    name,
                    rut: data.providerRut || `HIST-${slug}`,
                    category: 'HONORARIOS',
                    organizationId,
                },
            });
        } else if (!provider.category || !/honor/i.test(provider.category)) {
            provider = await this.prisma.provider.update({
                where: { id: provider.id },
                data: { category: 'HONORARIOS' },
            });
        }

        const existing = await this.prisma.dTE.findFirst({
            where: {
                providerId: provider.id,
                folio: data.folio,
                type: dteType,
                organizationId,
            },
        });

        if (existing) {
            throw new Error('La boleta con este folio ya existe para este trabajador.');
        }

        const issuedDate = data.date ? new Date(data.date) : new Date();

        return this.prisma.dTE.create({
            data: {
                folio: data.folio,
                type: dteType,
                totalAmount: data.amount,
                outstandingAmount: data.amount,
                paymentStatus: 'UNPAID',
                issuedDate,
                dueDate: issuedDate,
                rutIssuer: provider.rut || '1-9',
                rutReceiver: '1-9',
                siiStatus: 'ACEPTADO',
                metadata: {
                    notes: data.notes,
                    isManual: true,
                    kind: dteType === 39 ? 'BOLETA_ELECTRONICA' : 'BOLETA_HONORARIOS',
                },
                providerId: provider.id,
                organizationId,
            },
        });
    }

    /**
     * Marcar un DTE como revisado o pagado manualmente
     */
    async updateManualReview(id: string, organizationId: string | undefined, data: { note?: string; status?: string; ruleId?: string }) {
        if (!organizationId) throw new Error('Missing organizationId');

        const dte = await this.prisma.dTE.findUnique({
            where: { id }
        });

        if (!dte || dte.organizationId !== organizationId) {
            throw new Error('DTE no encontrado');
        }

        const currentMetadata = (dte.metadata as any) || {};

        return this.prisma.dTE.update({
            where: { id },
            data: {
                paymentStatus: data.status === 'PAID' ? 'PAID' : dte.paymentStatus,
                outstandingAmount: data.status === 'PAID' ? 0 : dte.outstandingAmount,
                metadata: {
                    ...currentMetadata,
                    reviewNote: data.note,
                    ruleId: data.ruleId,
                    reviewedAt: new Date().toISOString()
                }
            }
        });
    }

    async updateDteAmount(id: string, organizationId: string | undefined, amount: number) {
        if (!organizationId) throw new Error('Missing organizationId');

        const dte = await this.prisma.dTE.findUnique({
            where: { id }
        });

        if (!dte || dte.organizationId !== organizationId) {
            throw new Error('DTE no encontrado');
        }

        // Si ya está pagado por completo, mantenemos status pero ajustamos monto pendiente
        const newOutstanding = Math.max(0, amount - (dte.totalAmount - dte.outstandingAmount));
        const newStatus = newOutstanding <= 0 ? 'PAID' : (newOutstanding < amount ? 'PARTIAL' : 'UNPAID');

        return this.prisma.dTE.update({
            where: { id },
            data: {
                totalAmount: amount,
                outstandingAmount: newOutstanding,
                paymentStatus: newStatus as any
            }
        });
    }
}
