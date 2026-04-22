import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * MorningBriefingService
 * 
 * Genera el resumen ejecutivo que el usuario ve al entrar al sistema.
 * Diseñado para que el cron de las 4AM deje todo preparado y este
 * servicio simplemente lo lee de la BD con queries optimizadas.
 */
@Injectable()
export class MorningBriefingService {
    private readonly logger = new Logger(MorningBriefingService.name);

    // Rango de fechas del año fiscal activo
    private readonly YEAR_START = new Date('2026-01-01T00:00:00.000Z');
    private readonly YEAR_END = new Date('2027-01-01T00:00:00.000Z');

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Briefing completo para un tenant específico.
     * Retorna toda la info accionable para el dashboard.
     */
    async getBriefing(organizationId: string) {
        const startTime = Date.now();

        const [
            matchesPendientes,
            dtesUnpaid,
            dtesSinFactura,
            lastSync,
            lastMatchRun,
            proveedoresConDeuda,
        ] = await Promise.all([
            this.getMatchesPendingReview(organizationId),
            this.getDtesUnpaid(organizationId),
            this.getTransaccionesSinDte(organizationId),
            this.getLastSync(organizationId),
            this.getLastMatchRun(organizationId),
            this.getProveedoresConDeuda(organizationId),
        ]);

        const durationMs = Date.now() - startTime;
        this.logger.log(`Briefing generated for org ${organizationId} in ${durationMs}ms`);

        return {
            generatedAt: new Date().toISOString(),
            queryTimeMs: durationMs,

            // === 1. MATCHES POR REVISAR ===
            matchesPorRevisar: {
                total: matchesPendientes.count,
                montoTotal: matchesPendientes.totalAmount,
                items: matchesPendientes.items, // top 10 para preview
            },

            // === 2. PAGOS PENDIENTES A PROVEEDORES ===
            pagosPendientes: {
                total: dtesUnpaid.count,
                montoTotal: dtesUnpaid.totalAmount,
                proveedoresAfectados: dtesUnpaid.proveedoresCount,
                items: dtesUnpaid.items, // top 10
            },

            // === 3. MOVIMIENTOS SIN DTE (recordar al proveedor) ===
            sinDocumento: {
                total: dtesSinFactura.count,
                montoTotal: dtesSinFactura.totalAmount,
                items: dtesSinFactura.items,
            },

            // === 4. PROVEEDORES CON DEUDA ===
            proveedores: {
                conDeuda: proveedoresConDeuda.count,
                deudaTotal: proveedoresConDeuda.totalDeuda,
                top5: proveedoresConDeuda.items,
            },

            // === 5. ESTADO DE SINCRONIZACIÓN ===
            sincronizacion: {
                lastDteSync: lastSync,
                lastAutoMatch: lastMatchRun,
                healthy: lastSync !== null && lastSync.status === 'SUCCESS',
            },
        };
    }

    /**
     * Matches en estado DRAFT que necesitan revisión del usuario.
     */
    private async getMatchesPendingReview(organizationId: string) {
        const dateFilter = { date: { gte: this.YEAR_START, lt: this.YEAR_END } };
        const matches = await this.prisma.reconciliationMatch.findMany({
            where: {
                status: 'DRAFT',
                transaction: { bankAccount: { organizationId }, ...dateFilter },
            },
            include: {
                transaction: {
                    select: { id: true, date: true, amount: true, description: true },
                },
                dte: {
                    select: {
                        id: true, folio: true, type: true, totalAmount: true,
                        provider: { select: { name: true, rut: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
        });

        const totalCount = await this.prisma.reconciliationMatch.count({
            where: {
                status: 'DRAFT',
                transaction: { bankAccount: { organizationId }, ...dateFilter },
            },
        });

        // Sum ALL draft match amounts (not just the top 10 preview)
        const allDraftTxAmounts = await this.prisma.reconciliationMatch.findMany({
            where: {
                status: 'DRAFT',
                transaction: { bankAccount: { organizationId }, ...dateFilter },
            },
            select: { transaction: { select: { amount: true } } },
        });
        const totalAmount = allDraftTxAmounts.reduce((sum, m) => sum + Math.abs(m.transaction?.amount || 0), 0);

        return {
            count: totalCount,
            totalAmount,
            items: matches.map(m => ({
                matchId: m.id,
                confidence: m.confidence,
                rule: m.ruleApplied,
                transaction: {
                    date: m.transaction?.date,
                    amount: m.transaction?.amount,
                    description: m.transaction?.description,
                },
                dte: m.dte ? {
                    folio: m.dte.folio,
                    type: m.dte.type,
                    totalAmount: m.dte.totalAmount,
                    proveedor: m.dte.provider?.name,
                } : null,
            })),
        };
    }

    /**
     * DTEs UNPAID — facturas que están pendientes de pago.
     * Esto es lo que el usuario debe gestionar: "cuánto le debemos a quién"
     */
    private async getDtesUnpaid(organizationId: string) {
        const dateFilter = { issuedDate: { gte: this.YEAR_START, lt: this.YEAR_END } };
        const unpaid = await this.prisma.dTE.findMany({
            where: {
                paymentStatus: 'UNPAID',
                provider: { organizationId },
                ...dateFilter,
            },
            include: {
                provider: { select: { name: true, rut: true } },
            },
            orderBy: { totalAmount: 'desc' },
            take: 10,
        });

        const agg = await this.prisma.dTE.aggregate({
            where: {
                paymentStatus: 'UNPAID',
                provider: { organizationId },
                ...dateFilter,
            },
            _count: true,
            _sum: { outstandingAmount: true },
        });

        // Count distinct proveedores
        const proveedoresCount = await this.prisma.dTE.findMany({
            where: {
                paymentStatus: 'UNPAID',
                provider: { organizationId },
                ...dateFilter,
            },
            select: { providerId: true },
            distinct: ['providerId'],
        });

        return {
            count: agg._count,
            totalAmount: agg._sum.outstandingAmount || 0,
            proveedoresCount: proveedoresCount.length,
            items: unpaid.map(d => ({
                id: d.id,
                folio: d.folio,
                type: d.type,
                totalAmount: d.totalAmount,
                outstandingAmount: d.outstandingAmount,
                issuedDate: d.issuedDate,
                dueDate: d.dueDate,
                proveedor: d.provider?.name,
                rutProveedor: d.provider?.rut,
            })),
        };
    }

    /**
     * Movimientos bancarios tipo DEBIT sin match — "pagamos algo y no hay DTE"
     * Estos son los que se deben pedir factura al proveedor.
     */
    private async getTransaccionesSinDte(organizationId: string) {
        const dateFilter = { date: { gte: this.YEAR_START, lt: this.YEAR_END } };
        const txSinDte = await this.prisma.bankTransaction.findMany({
            where: {
                status: 'PENDING',
                type: 'DEBIT',
                bankAccount: { organizationId },
                ...dateFilter,
            },
            orderBy: { amount: 'asc' }, // más negativos (mayores egresos) primero
            take: 10,
            select: {
                id: true,
                date: true,
                amount: true,
                description: true,
                bankAccount: { select: { bankName: true } },
            },
        });

        const agg = await this.prisma.bankTransaction.aggregate({
            where: {
                status: 'PENDING',
                type: 'DEBIT',
                bankAccount: { organizationId },
                ...dateFilter,
            },
            _count: true,
            _sum: { amount: true },
        });

        return {
            count: agg._count,
            totalAmount: Math.abs(agg._sum.amount || 0),
            items: txSinDte.map(t => ({
                id: t.id,
                date: t.date,
                amount: t.amount,
                description: t.description,
                bank: t.bankAccount?.bankName,
            })),
        };
    }

    /**
     * Top proveedores con deuda (currentBalance > 0).
     */
    private async getProveedoresConDeuda(organizationId: string) {
        const providers = await this.prisma.provider.findMany({
            where: {
                organizationId,
                currentBalance: { gt: 0 },
            },
            orderBy: { currentBalance: 'desc' },
            take: 5,
            select: {
                id: true,
                name: true,
                rut: true,
                currentBalance: true,
            },
        });

        const agg = await this.prisma.provider.aggregate({
            where: {
                organizationId,
                currentBalance: { gt: 0 },
            },
            _count: true,
            _sum: { currentBalance: true },
        });

        return {
            count: agg._count,
            totalDeuda: agg._sum.currentBalance || 0,
            items: providers,
        };
    }

    /**
     * Estado de la última sincronización DTE.
     */
    private async getLastSync(organizationId: string) {
        const last = await this.prisma.syncLog.findFirst({
            where: {
                organizationId,
                type: { in: ['DTE_SYNC', 'STARTUP_SYNC'] },
            },
            orderBy: { startedAt: 'desc' },
        });

        if (!last) return null;

        return {
            type: last.type,
            status: last.status,
            created: last.created,
            skipped: last.skipped,
            errors: last.errors,
            totalFound: last.totalFound,
            startedAt: last.startedAt,
            finishedAt: last.finishedAt,
            durationMs: last.durationMs,
            message: last.message,
        };
    }

    /**
     * Estado del último ciclo de auto-match.
     */
    private async getLastMatchRun(organizationId: string) {
        const last = await this.prisma.syncLog.findFirst({
            where: {
                organizationId,
                type: 'AUTO_MATCH',
            },
            orderBy: { startedAt: 'desc' },
        });

        if (!last) return null;

        return {
            status: last.status,
            created: last.created,
            startedAt: last.startedAt,
            finishedAt: last.finishedAt,
            durationMs: last.durationMs,
            message: last.message,
        };
    }
}
