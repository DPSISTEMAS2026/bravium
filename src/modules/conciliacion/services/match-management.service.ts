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
            include: { transaction: { include: { bankAccount: true } }, dte: true },
        });
        if (!match) throw new NotFoundException(`Match ${matchId} no encontrado`);

        // OPTIONAL: Security check - can this user touch this match?
        // if (match.organizationId && match.organizationId !== contextOrganizationId) throw new ForbiddenException();

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
        body: { transactionId?: string; transactionIds?: string[]; dteId?: string; dteIds?: string[]; paymentId?: string; notes?: string; action?: 'PARTIAL' | 'EXACT' },
        userId: string,
        organizationId: string,
    ) {
        const txIds = body.transactionIds && body.transactionIds.length > 0 
            ? body.transactionIds 
            : body.transactionId ? [body.transactionId] : [];

        if (txIds.length === 0) throw new BadRequestException('Se requiere al menos un transactionId');

        const transactions = await this.prisma.bankTransaction.findMany({ where: { id: { in: txIds } } });
        if (transactions.length !== txIds.length) {
            this.logger.error(`Manual match 404: txIds sent=${JSON.stringify(txIds)}. Found=${transactions.map(t=>t.id).join(',')}`);
            throw new NotFoundException(`Una o más transacciones no encontradas: ${JSON.stringify(txIds)}`);
        }
        
        // Auto-release any existing CONFIRMED matches on these transactions
        for (const tx of transactions) {
            if (tx.status === 'MATCHED') {
                const existingMatches = await this.prisma.reconciliationMatch.findMany({
                    where: { transactionId: tx.id, status: 'CONFIRMED' },
                    include: { dte: true },
                });
                for (const m of existingMatches) {
                    if (m.dteId && m.dte) {
                        await this.prisma.dTE.update({
                            where: { id: m.dteId },
                            data: { paymentStatus: 'UNPAID', outstandingAmount: m.dte.totalAmount },
                        });
                    }
                    await this.prisma.reconciliationMatch.delete({ where: { id: m.id } });
                }
                await this.prisma.bankTransaction.update({
                    where: { id: tx.id },
                    data: { status: TransactionStatus.PENDING },
                });
                this.logger.log(`Auto-released ${existingMatches.length} match(es) from tx ${tx.id.slice(0,8)} for manual re-match`);
            }
        }

        const dteIds = body.dteIds && body.dteIds.length > 0 ? body.dteIds : body.dteId ? [body.dteId] : [];

        if (dteIds.length > 0) {
            const dtes = await this.prisma.dTE.findMany({ where: { id: { in: dteIds } } });
            if (dtes.length !== dteIds.length) throw new NotFoundException('Uno o más DTEs no encontrados');
        }

        const matchResult = await this.prisma.$transaction(async (prisma) => {
            const createdMatches = [];
            
            if (dteIds.length > 0) {
                let totalAvailable = transactions.reduce((acc, t) => acc + Math.abs(t.amount), 0);
                const currentDtes = await prisma.dTE.findMany({ where: { id: { in: dteIds } }, orderBy: { issuedDate: 'asc' } });
                
                // Crear 1 match por DTE, distribuido entre las transacciones disponibles.
                // Para SUM (N txs → 1 dte): todas las txs se vinculan al DTE con un match cada una.
                // Para SPLIT (1 tx → N dtes): cada DTE se vincula a la transacción principal.
                // Para N:M: cada DTE se vincula a una TX de forma round-robin para evitar el producto cartesiano.
                const isSumMatch = txIds.length > 1 && currentDtes.length === 1;
                
                if (isSumMatch) {
                    // SUM: Múltiples transacciones pagan 1 DTE — crear 1 match por TX
                    const dte = currentDtes[0];
                    for (const tId of txIds) {
                        const created = await prisma.reconciliationMatch.create({
                            data: {
                                transactionId: tId,
                                dteId: dte.id,
                                paymentId: body.paymentId || null,
                                origin: 'MANUAL',
                                status: 'CONFIRMED',
                                confidence: 1.0,
                                ruleApplied: 'MANUAL_USER',
                                notes: body.notes || null,
                                createdBy: userId,
                                confirmedAt: new Date(),
                                confirmedBy: userId,
                                organizationId,
                            },
                        });
                        createdMatches.push(created);
                    }

                    if (body.action === 'PARTIAL') {
                        const paymentAmount = Math.min(dte.outstandingAmount, totalAvailable);
                        const newOutstanding = Number((dte.outstandingAmount - paymentAmount).toFixed(0));
                        await prisma.dTE.update({
                            where: { id: dte.id },
                            data: { 
                                outstandingAmount: newOutstanding,
                                paymentStatus: newOutstanding > 0 ? 'PARTIAL' : 'PAID'
                            }
                        });
                    } else {
                        await prisma.dTE.update({
                            where: { id: dte.id },
                            data: { paymentStatus: 'PAID', outstandingAmount: 0 },
                        });
                    }
                } else {
                    // SPLIT o 1:1 — cada DTE se vincula a la TX principal (primera) o round-robin
                    const primaryTxId = txIds[0];
                    for (let i = 0; i < currentDtes.length; i++) {
                        const dte = currentDtes[i];
                        // Round-robin: distribuir DTEs entre las transacciones disponibles
                        const assignedTxId = txIds.length > 1 ? txIds[i % txIds.length] : primaryTxId;
                        
                        const created = await prisma.reconciliationMatch.create({
                            data: {
                                transactionId: assignedTxId,
                                dteId: dte.id,
                                paymentId: body.paymentId || null,
                                origin: 'MANUAL',
                                status: 'CONFIRMED',
                                confidence: 1.0,
                                ruleApplied: 'MANUAL_USER',
                                notes: body.notes || null,
                                createdBy: userId,
                                confirmedAt: new Date(),
                                confirmedBy: userId,
                                organizationId,
                            },
                        });
                        createdMatches.push(created);

                        if (body.action === 'PARTIAL') {
                            const paymentAmount = Math.min(dte.outstandingAmount, totalAvailable);
                            totalAvailable -= paymentAmount;
                            const newOutstanding = Number((dte.outstandingAmount - paymentAmount).toFixed(0));
                            await prisma.dTE.update({
                                where: { id: dte.id },
                                data: { 
                                    outstandingAmount: newOutstanding,
                                    paymentStatus: newOutstanding > 0 ? 'PARTIAL' : 'PAID'
                                }
                            });
                        } else {
                            await prisma.dTE.update({
                                where: { id: dte.id },
                                data: { paymentStatus: 'PAID', outstandingAmount: 0 },
                            });
                        }
                    }
                }
                
                // Marcar TODAS las transacciones como MATCHED
                for (const tId of txIds) {
                    await prisma.bankTransaction.update({
                        where: { id: tId },
                        data: { status: TransactionStatus.MATCHED },
                    });
                }
            } else {
                for (const tId of txIds) {
                    if (body.paymentId) {
                        const created = await prisma.reconciliationMatch.create({
                            data: {
                                transactionId: tId,
                                dteId: null,
                                paymentId: body.paymentId,
                                origin: 'MANUAL',
                                status: 'CONFIRMED',
                                confidence: 1.0,
                                ruleApplied: 'MANUAL_USER',
                                notes: body.notes || null,
                                createdBy: userId,
                                confirmedAt: new Date(),
                                confirmedBy: userId,
                                organizationId,
                            },
                        });
                        createdMatches.push(created);
                    }
                    await prisma.bankTransaction.update({
                        where: { id: tId },
                        data: { status: TransactionStatus.MATCHED },
                    });
                }
            }

            // Clean up any pending suggestions that involve these transactions or DTEs
            const pendingSuggestions = await prisma.matchSuggestion.findMany({ where: { status: 'PENDING', organizationId } });
            const sIdsToDelete = pendingSuggestions.filter(s => {
                if (dteIds.includes(s.dteId)) return true;
                const sTxIds = (s.transactionIds as string[]) || [];
                return sTxIds.some(tid => txIds.includes(tid));
            }).map(s => s.id);
            if (sIdsToDelete.length > 0) {
                await prisma.matchSuggestion.deleteMany({ where: { id: { in: sIdsToDelete } } });
                this.logger.log(`Limpiadas ${sIdsToDelete.length} sugerencias pendientes para los Tx/DTEs recién conciliados`);
            }

            return createdMatches[0];
        });

        await this.audit.logAction(
            { userId },
            {
                action: 'MANUAL_MATCH_CREATED',
                entityType: 'ReconciliationMatch',
                entityId: matchResult.id,
                newValue: { 
                    transactionIds: txIds, 
                    dteId: body.dteId, 
                    dteIds: body.dteIds, 
                    paymentId: body.paymentId 
                },
                metadata: { notes: body.notes },
            },
        );

        return matchResult;
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

    /**
     * Reassign a DTE from its current match to a new transaction.
     * This will:
     * 1. Delete the old match on the DTE (releasing the old transaction back to PENDING)
     * 2. Delete any existing match on the new transaction (if reviewing a suggestion)
     * 3. Create a new CONFIRMED manual match between the new transaction and the DTE
     */
    async reassignDte(
        body: { transactionId: string; dteId: string; currentMatchId?: string },
        userId: string,
    ) {
        const targetTx = await this.prisma.bankTransaction.findUnique({ where: { id: body.transactionId } });
        if (!targetTx) throw new NotFoundException('Transacción destino no encontrada');

        const dte = await this.prisma.dTE.findUnique({ where: { id: body.dteId } });
        if (!dte) throw new NotFoundException('DTE no encontrado');

        // Find the existing match on this DTE (the one we're "stealing" it from)
        const existingDteMatch = await this.prisma.reconciliationMatch.findFirst({
            where: {
                dteId: body.dteId,
                status: { in: ['CONFIRMED', 'DRAFT'] },
            },
            include: { transaction: true, dte: true },
        });

        const result = await this.prisma.$transaction(async (tx) => {
            // 1. Release the DTE from its old match
            if (existingDteMatch) {
                // Set the old transaction back to PENDING
                await tx.bankTransaction.update({
                    where: { id: existingDteMatch.transactionId },
                    data: { status: TransactionStatus.PENDING },
                });

                // Delete the old match
                await tx.reconciliationMatch.delete({ where: { id: existingDteMatch.id } });
            }

            // 2. Delete any existing match on the current transaction (e.g., wrong suggestion)
            if (body.currentMatchId) {
                const currentMatch = await tx.reconciliationMatch.findUnique({
                    where: { id: body.currentMatchId },
                    include: { dte: true },
                });
                if (currentMatch) {
                    // If the current match pointed to a different DTE, release that DTE too
                    if (currentMatch.dteId && currentMatch.dteId !== body.dteId) {
                        await tx.dTE.update({
                            where: { id: currentMatch.dteId },
                            data: { paymentStatus: 'UNPAID', outstandingAmount: currentMatch.dte?.totalAmount ?? 0 },
                        });
                    }
                    await tx.reconciliationMatch.delete({ where: { id: body.currentMatchId } });
                }
            }

            // 3. Reset DTE status (will be set to PAID by the new match)
            await tx.dTE.update({
                where: { id: body.dteId },
                data: { paymentStatus: 'PAID', outstandingAmount: 0 },
            });

            // 4. Create the new manual match
            const newMatch = await tx.reconciliationMatch.create({
                data: {
                    transactionId: body.transactionId,
                    dteId: body.dteId,
                    origin: 'MANUAL',
                    status: 'CONFIRMED',
                    confidence: 1.0,
                    ruleApplied: 'MANUAL_REASSIGN',
                    notes: existingDteMatch
                        ? `Reasignado desde tx ${existingDteMatch.transactionId.slice(0, 8)}…`
                        : null,
                    createdBy: userId,
                    confirmedAt: new Date(),
                    confirmedBy: userId,
                },
            });

            // 5. Mark the target transaction as MATCHED
            await tx.bankTransaction.update({
                where: { id: body.transactionId },
                data: { status: TransactionStatus.MATCHED },
            });

            // 6. Clean up any pending suggestions that involve these transactions or DTEs
            const pendingSuggestions = await tx.matchSuggestion.findMany({ where: { status: 'PENDING' } });
            const sIdsToDelete = pendingSuggestions.filter(s => {
                if (body.dteId === s.dteId) return true;
                const sTxIds = (s.transactionIds as string[]) || [];
                return sTxIds.includes(body.transactionId);
            }).map(s => s.id);
            if (sIdsToDelete.length > 0) {
                await tx.matchSuggestion.deleteMany({ where: { id: { in: sIdsToDelete } } });
                this.logger.log(`Limpiadas ${sIdsToDelete.length} sugerencias pendientes para el reassign de Tx/DTEs`);
            }

            return newMatch;
        });

        await this.audit.logAction(
            { userId },
            {
                action: 'DTE_REASSIGNED',
                entityType: 'ReconciliationMatch',
                entityId: result.id,
                previousValue: existingDteMatch
                    ? {
                        oldMatchId: existingDteMatch.id,
                        oldTransactionId: existingDteMatch.transactionId,
                    }
                    : undefined,
                newValue: {
                    newMatchId: result.id,
                    transactionId: body.transactionId,
                    dteId: body.dteId,
                },
            },
        );

        this.logger.log(
            `DTE ${body.dteId} reassigned: old tx=${existingDteMatch?.transactionId || 'none'} → new tx=${body.transactionId}`,
        );

        return {
            success: true,
            newMatch: result,
            releasedTransactionId: existingDteMatch?.transactionId || null,
        };
    }

    async getMatchHistory(matchId: string) {
        const logs = await this.prisma.auditLog.findMany({
            where: { entityType: 'ReconciliationMatch', entityId: matchId },
            orderBy: { createdAt: 'desc' },
        });
        return logs;
    }

    async getHistoricalNotes(organizationId?: string) {
        const matches = await this.prisma.reconciliationMatch.findMany({
            where: {
                notes: { not: null },
                NOT: { notes: '' },
                status: 'CONFIRMED',
                transaction: {
                    bankAccount: organizationId ? { organizationId } : undefined,
                },
            },
            include: {
                transaction: { select: { description: true, amount: true } }
            },
            orderBy: { confirmedAt: 'desc' },
            take: 1000,
        });

        // Generic bank descriptions that shouldn't be matched
        const GENERIC_GLOSAS = new Set([
            'COMPRA NACIONAL POR INTERNET',
            'COMPRA INTERNACIONAL POR INTERNET',
            'COMPRA NORMAL',
            'TRASPASO',
            'CARGO',
            'ABONO',
            'TEF',
        ]);

        const notesMap: Record<string, string> = {};
        for (const m of matches as any[]) {
            const desc = m.transaction?.description;
            const amount = m.transaction?.amount;
            if (!desc || !m.notes) continue;
            // Skip system-generated notes
            if (m.notes.startsWith('[REJECTED]') || m.notes.startsWith('[CONFIRMED]')) continue;
            // Skip generic descriptions
            if (GENERIC_GLOSAS.has(desc.toUpperCase().trim())) continue;
            // Use description|amount as composite key so same glosa with different amount won't match
            const key = `${desc}|${amount}`;
            if (!notesMap[key]) {
                notesMap[key] = m.notes;
            }
        }
        return notesMap;
    }
}
