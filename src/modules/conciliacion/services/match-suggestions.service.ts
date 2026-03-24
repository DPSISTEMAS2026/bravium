import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TransactionStatus, MatchStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class MatchSuggestionsService {
    private readonly logger = new Logger(MatchSuggestionsService.name);

    constructor(
        private prisma: PrismaService,
        private auditService: AuditService,
    ) {}

    async listSuggestions(status?: string, organizationId?: string) {
        const where: any = {};
        if (status) where.status = status;
        
        // Excluir sugerencias para DTEs que ya están Pagados
        where.dte = {
            paymentStatus: { not: 'PAID' },
            ...(organizationId ? { provider: { organizationId } } : {}),
        };

        const suggestions = await this.prisma.matchSuggestion.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                dte: {
                    include: { provider: { select: { name: true, rut: true } } },
                },
            },
        });

        const enriched = await Promise.all(
            suggestions.map(async (s) => {
                const txIds = (s.transactionIds || []) as string[];
                const transactions = txIds.length > 0
                    ? await this.prisma.bankTransaction.findMany({
                        where: { id: { in: txIds } },
                        select: { id: true, date: true, description: true, amount: true, type: true },
                        orderBy: { date: 'asc' },
                    })
                    : [];

                let relatedDtes: any[] = [];
                if (s.type === 'SPLIT') {
                    const dteIds = (s.relatedDteIds || []) as string[];
                    if (dteIds.length > 0) {
                        relatedDtes = await this.prisma.dTE.findMany({
                            where: { id: { in: dteIds } },
                            select: {
                                id: true, folio: true, type: true,
                                totalAmount: true, issuedDate: true,
                                provider: { select: { name: true } },
                            },
                            orderBy: { issuedDate: 'asc' },
                        });
                    }
                }

                return { ...s, transactions, relatedDtes };
            }),
        );

        return enriched;
    }

    async getSuggestionById(id: string) {
        const s = await this.prisma.matchSuggestion.findUnique({
            where: { id },
            include: {
                dte: {
                    include: { provider: { select: { name: true, rut: true } } },
                },
            },
        });
        if (!s) return null;
        const txIds = (s.transactionIds || []) as string[];
        const transactions =
            txIds.length > 0
                ? await this.prisma.bankTransaction.findMany({
                    where: { id: { in: txIds } },
                    select: {
                        id: true,
                        date: true,
                        description: true,
                        amount: true,
                        type: true,
                        bankAccount: { select: { bankName: true, accountNumber: true } },
                    },
                    orderBy: { date: 'asc' },
                })
                : [];
        let relatedDtes: any[] = [];
        if (s.type === 'SPLIT') {
            const dteIds = (s.relatedDteIds || []) as string[];
            if (dteIds.length > 0) {
                relatedDtes = await this.prisma.dTE.findMany({
                    where: { id: { in: dteIds } },
                    select: {
                        id: true,
                        folio: true,
                        type: true,
                        totalAmount: true,
                        issuedDate: true,
                        provider: { select: { name: true, rut: true } },
                    },
                    orderBy: { issuedDate: 'asc' },
                });
            }
        }
        return { ...s, transactions, relatedDtes };
    }

    async acceptSuggestion(id: string, userId?: string, overrides?: { transactionIds?: string[]; dteId?: string }) {
        const suggestion = await this.prisma.matchSuggestion.findUnique({
            where: { id },
            include: { dte: { include: { provider: true } } },
        });
        if (!suggestion) throw new NotFoundException('Sugerencia no encontrada');
        if (suggestion.status !== 'PENDING') {
            throw new BadRequestException('Sugerencia ya fue procesada');
        }

        if (suggestion.type === 'SPLIT') {
            await this.acceptSplitSuggestion(suggestion, userId);
        } else {
            await this.acceptSumSuggestion(suggestion, userId, overrides);
        }

        const finalTxIds = overrides?.transactionIds ?? (suggestion.transactionIds as string[]);
        const finalDteId = overrides?.dteId ?? suggestion.dteId;

        await this.auditService.logAction(
            { userId },
            {
                action: 'ACCEPT_SUGGESTION',
                entityType: 'MatchSuggestion',
                entityId: id,
                newValue: {
                    type: suggestion.type,
                    transactionIds: finalTxIds,
                    dteId: finalDteId,
                    relatedDteIds: suggestion.relatedDteIds,
                    overrides: overrides ? true : undefined,
                },
            },
        );

        return { success: true };
    }

    /**
     * SUM (N:1): N transacciones -> 1 DTE.
     * Opcionalmente overrides: transactionIds (subconjunto de original + opcionalmente más movimientos del mismo RUT) y/o dteId (otro DTE del mismo proveedor, sin pagar).
     */
    private async acceptSumSuggestion(suggestion: any, userId?: string, overrides?: { transactionIds?: string[]; dteId?: string }) {
        const originalTxIds = (suggestion.transactionIds || []) as string[];
        let txIds: string[];
        if (overrides?.transactionIds != null && overrides.transactionIds.length > 0) {
            txIds = overrides.transactionIds;
        } else {
            txIds = originalTxIds;
        }

        if (txIds.length === 0) {
            throw new BadRequestException('Debe incluir al menos un movimiento para aceptar la sugerencia');
        }

        // Validar que todos los movimientos existan y estén PENDING o UNMATCHED (permite añadir movimientos al RUT)
        const existing = await this.prisma.bankTransaction.findMany({
            where: { id: { in: txIds } },
            select: { id: true, status: true },
        });
        const existingIds = new Set(existing.map((t) => t.id));
        const invalid = txIds.filter((id) => !existingIds.has(id));
        if (invalid.length > 0) {
            throw new BadRequestException('Uno o más movimientos no existen');
        }
        const notPending = existing.filter((t) => t.status !== 'PENDING' && t.status !== 'UNMATCHED');
        if (notPending.length > 0) {
            throw new BadRequestException('Todos los movimientos deben estar pendientes o sin match');
        }

        let dteId = suggestion.dteId;
        if (overrides?.dteId) {
            const dte = await this.prisma.dTE.findUnique({
                where: { id: overrides.dteId },
                include: { provider: true },
            });
            if (!dte) throw new BadRequestException('DTE no encontrado');
            if (dte.paymentStatus !== 'UNPAID') {
                throw new BadRequestException('El DTE seleccionado ya está marcado como pagado');
            }
            const suggestionProviderId = suggestion.dte?.providerId ?? suggestion.dte?.provider?.id;
            if (dte.providerId && suggestionProviderId && dte.providerId !== suggestionProviderId) {
                throw new BadRequestException('El DTE debe ser del mismo proveedor que la sugerencia');
            }
            dteId = overrides.dteId;
        }

        await this.prisma.$transaction(async (prisma) => {
            for (const txId of txIds) {
                await prisma.reconciliationMatch.create({
                    data: {
                        transactionId: txId,
                        dteId,
                        origin: 'MANUAL',
                        status: MatchStatus.CONFIRMED,
                        confidence: suggestion.confidence,
                        ruleApplied: `SumMatch (sugerencia ${suggestion.id})`,
                        createdBy: userId,
                    },
                });

                await prisma.bankTransaction.update({
                    where: { id: txId },
                    data: { status: TransactionStatus.MATCHED },
                });
            }

            await prisma.dTE.update({
                where: { id: dteId },
                data: { paymentStatus: 'PAID', outstandingAmount: 0 },
            });

            await prisma.matchSuggestion.update({
                where: { id: suggestion.id },
                data: { status: 'ACCEPTED' },
            });
        });
    }

    /**
     * SPLIT (1:N): 1 transacción -> N DTEs.
     * Creates one match per DTE, all pointing to the same transaction.
     */
    private async acceptSplitSuggestion(suggestion: any, userId?: string) {
        const txIds = suggestion.transactionIds as string[];
        const txId = txIds[0];
        const dteIds = (suggestion.relatedDteIds || [suggestion.dteId]) as string[];

        await this.prisma.$transaction(async (prisma) => {
            for (const dteId of dteIds) {
                await prisma.reconciliationMatch.create({
                    data: {
                        transactionId: txId,
                        dteId,
                        origin: 'MANUAL',
                        status: MatchStatus.CONFIRMED,
                        confidence: suggestion.confidence,
                        ruleApplied: `SplitPayment (sugerencia ${suggestion.id})`,
                        createdBy: userId,
                    },
                });

                await prisma.dTE.update({
                    where: { id: dteId },
                    data: { paymentStatus: 'PAID', outstandingAmount: 0 },
                });
            }

            await prisma.bankTransaction.update({
                where: { id: txId },
                data: { status: TransactionStatus.MATCHED },
            });

            await prisma.matchSuggestion.update({
                where: { id: suggestion.id },
                data: { status: 'ACCEPTED' },
            });
        });
    }

    async rejectSuggestion(id: string, reason?: string, userId?: string) {
        const suggestion = await this.prisma.matchSuggestion.findUnique({ where: { id } });
        if (!suggestion) throw new NotFoundException('Sugerencia no encontrada');

        await this.prisma.matchSuggestion.update({
            where: { id },
            data: { status: 'REJECTED', reason: reason || 'Rechazada por usuario' },
        });

        await this.auditService.logAction(
            { userId },
            {
                action: 'REJECT_SUGGESTION',
                entityType: 'MatchSuggestion',
                entityId: id,
                newValue: { reason },
            },
        );

        return { success: true };
    }
}
