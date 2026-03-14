import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { MatchStatus, TransactionStatus } from '@prisma/client';

@Injectable()
export class MatchManagementService {
    private readonly logger = new Logger(MatchManagementService.name);

    constructor(
        private prisma: PrismaService,
        private audit: AuditService,
    ) {}

    async updateMatchStatus(matchId: string, newStatus: 'CONFIRMED' | 'REJECTED', userId: string, reason?: string) {
        const match = await this.prisma.reconciliationMatch.findUnique({
            where: { id: matchId },
            include: { transaction: true, dte: true },
        });
        if (!match) throw new NotFoundException(`Match ${matchId} no encontrado`);

        const previousStatus = match.status;
        if (previousStatus === newStatus) return match;

        const updated = await this.prisma.$transaction(async (tx) => {
            const updatedMatch = await tx.reconciliationMatch.update({
                where: { id: matchId },
                data: {
                    status: newStatus as MatchStatus,
                    confirmedAt: newStatus === 'CONFIRMED' ? new Date() : null,
                    confirmedBy: userId,
                    notes: reason ? `${match.notes ? match.notes + '\n' : ''}[${newStatus}] ${reason}` : match.notes,
                },
            });

            if (newStatus === 'CONFIRMED') {
                await tx.bankTransaction.update({
                    where: { id: match.transactionId },
                    data: { status: TransactionStatus.MATCHED },
                });
                if (match.dteId) {
                    await tx.dTE.update({
                        where: { id: match.dteId },
                        data: { paymentStatus: 'PAID', outstandingAmount: 0 },
                    });
                }
            } else if (newStatus === 'REJECTED') {
                await tx.bankTransaction.update({
                    where: { id: match.transactionId },
                    data: { status: TransactionStatus.PENDING },
                });
                if (match.dteId) {
                    const dte = await tx.dTE.findUnique({ where: { id: match.dteId } });
                    if (dte) {
                        await tx.dTE.update({
                            where: { id: match.dteId },
                            data: { paymentStatus: 'UNPAID', outstandingAmount: dte.totalAmount },
                        });
                    }
                }
            }

            return updatedMatch;
        });

        await this.audit.logAction(
            { userId },
            {
                action: `MATCH_STATUS_${newStatus}`,
                entityType: 'ReconciliationMatch',
                entityId: matchId,
                previousValue: { status: previousStatus },
                newValue: { status: newStatus, reason },
            },
        );

        return updated;
    }

    async updateMatchNotes(matchId: string, notes: string, userId: string) {
        const match = await this.prisma.reconciliationMatch.findUnique({ where: { id: matchId } });
        if (!match) throw new NotFoundException(`Match ${matchId} no encontrado`);

        const previousNotes = match.notes;
        const updated = await this.prisma.reconciliationMatch.update({
            where: { id: matchId },
            data: { notes },
        });

        await this.audit.logAction(
            { userId },
            {
                action: 'MATCH_NOTES_UPDATED',
                entityType: 'ReconciliationMatch',
                entityId: matchId,
                previousValue: { notes: previousNotes },
                newValue: { notes },
            },
        );

        return updated;
    }

    async createManualMatch(
        body: { transactionId: string; dteId?: string; paymentId?: string; notes?: string },
        userId: string,
    ) {
        const tx = await this.prisma.bankTransaction.findUnique({ where: { id: body.transactionId } });
        if (!tx) throw new NotFoundException('Transacción no encontrada');
        if (tx.status === 'MATCHED') throw new BadRequestException('Esta transacción ya tiene un match activo');

        if (body.dteId) {
            const dte = await this.prisma.dTE.findUnique({ where: { id: body.dteId } });
            if (!dte) throw new NotFoundException('DTE no encontrado');
        }

        const match = await this.prisma.$transaction(async (prisma) => {
            const created = await prisma.reconciliationMatch.create({
                data: {
                    transactionId: body.transactionId,
                    dteId: body.dteId || null,
                    paymentId: body.paymentId || null,
                    origin: 'MANUAL',
                    status: 'CONFIRMED',
                    confidence: 1.0,
                    ruleApplied: 'MANUAL_USER',
                    notes: body.notes || null,
                    createdBy: userId,
                    confirmedAt: new Date(),
                    confirmedBy: userId,
                },
            });

            await prisma.bankTransaction.update({
                where: { id: body.transactionId },
                data: { status: TransactionStatus.MATCHED },
            });

            if (body.dteId) {
                await prisma.dTE.update({
                    where: { id: body.dteId },
                    data: { paymentStatus: 'PAID', outstandingAmount: 0 },
                });
            }

            return created;
        });

        await this.audit.logAction(
            { userId },
            {
                action: 'MANUAL_MATCH_CREATED',
                entityType: 'ReconciliationMatch',
                entityId: match.id,
                newValue: { transactionId: body.transactionId, dteId: body.dteId, paymentId: body.paymentId },
                metadata: { notes: body.notes },
            },
        );

        return match;
    }

    async deleteMatch(matchId: string, userId: string) {
        const match = await this.prisma.reconciliationMatch.findUnique({
            where: { id: matchId },
            include: { dte: true },
        });
        if (!match) throw new NotFoundException(`Match ${matchId} no encontrado`);

        await this.prisma.$transaction(async (tx) => {
            await tx.bankTransaction.update({
                where: { id: match.transactionId },
                data: { status: TransactionStatus.PENDING },
            });

            if (match.dteId && match.dte) {
                await tx.dTE.update({
                    where: { id: match.dteId },
                    data: { paymentStatus: 'UNPAID', outstandingAmount: match.dte.totalAmount },
                });
            }

            await tx.reconciliationMatch.delete({ where: { id: matchId } });
        });

        await this.audit.logAction(
            { userId },
            {
                action: 'MATCH_DELETED',
                entityType: 'ReconciliationMatch',
                entityId: matchId,
                previousValue: {
                    transactionId: match.transactionId,
                    dteId: match.dteId,
                    origin: match.origin,
                    status: match.status,
                },
            },
        );

        return { success: true, message: 'Match eliminado correctamente' };
    }

    async getMatchHistory(matchId: string) {
        const logs = await this.prisma.auditLog.findMany({
            where: { entityType: 'ReconciliationMatch', entityId: matchId },
            orderBy: { createdAt: 'desc' },
        });
        return logs;
    }
}
