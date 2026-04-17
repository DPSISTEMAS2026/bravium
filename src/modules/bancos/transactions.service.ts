import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import { DataVisibilityService } from '../../common/services/data-visibility.service';

export interface TransactionFilters {
    organizationId?: string;
    fromDate?: string;
    toDate?: string;
    bankAccountId?: string;
    type?: string;
    status?: string;
    minAmount?: number;
    maxAmount?: number;
    page?: number;
    limit?: number;
    search?: string;
    filename?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
}

const CACHE_TTL = 30_000; // 30 seconds

@Injectable()
export class TransactionsService {
    private readonly logger = new Logger(TransactionsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly cache: CacheService,
        private readonly visibility: DataVisibilityService,
    ) { }

    private buildWhere(filters: TransactionFilters) {
        const where: any = {};

        if (filters.organizationId) {
            where.bankAccount = { organizationId: filters.organizationId };
        }

        const minDate = this.visibility.applyMinDate(
            filters.fromDate ? new Date(filters.fromDate) : undefined,
        );

        if (minDate || filters.toDate) {
            where.date = {};
            if (minDate) where.date.gte = minDate;
            if (filters.toDate) where.date.lte = new Date(filters.toDate);
        }

        if (filters.bankAccountId) {
            where.bankAccountId = filters.bankAccountId;
        }

        if (filters.type && filters.type !== 'ALL') {
            where.type = filters.type;
        }

        if (filters.status && filters.status !== 'ALL') {
            if (filters.status === 'CREDIT_ABONOS') {
                where.status = 'PENDING';
                where.type = 'CREDIT';
            } else {
                const statuses = filters.status.split(',').map((s) => s.trim()).filter(Boolean);
                if (statuses.length > 1) {
                    where.status = { in: statuses };
                } else {
                    where.status = filters.status;
                }

                // Si se consultan transacciones pendientes, excluir Abonos (tipo CREDIT)
                if (filters.status === 'PENDING') {
                    where.type = 'DEBIT'; // Solo cargos quedarán como pendientes por defecto
                }
            }
        }

        if (filters.minAmount || filters.maxAmount) {
            where.amount = {};
            if (filters.minAmount) {
                where.amount.gte = filters.minAmount;
            }
            if (filters.maxAmount) {
                where.amount.lte = filters.maxAmount;
            }
        }

        if (filters.search && filters.search.trim()) {
            const raw = filters.search.trim();
            const digitsOnly = raw.replace(/\D/g, '');
            const orConditions: any[] = [
                { description: { contains: raw, mode: 'insensitive' } },
                { reference: { contains: raw, mode: 'insensitive' } },
            ];
            if (digitsOnly.length >= 2) {
                const amountNum = parseInt(digitsOnly, 10);
                if (!isNaN(amountNum) && amountNum > 0) {
                    orConditions.push({ amount: amountNum }, { amount: -amountNum });
                }
            }
            where.OR = orConditions;
        }

        if (filters.filename && filters.filename !== 'ALL') {
            if (filters.filename === '__NO_SOURCE_FILE__') {
                // Movimientos sin archivo de origen (ej. otra fuente de ingesta)
                where.AND = where.AND || [];
                where.AND.push({
                    OR: [
                        { metadata: { path: ['sourceFile'], equals: null } },
                        { metadata: { path: ['sourceFile'], equals: '' } },
                    ],
                });
            } else {
                where.metadata = {
                    path: ['sourceFile'],
                    equals: filters.filename,
                };
            }
        }

        return where;
    }

    /**
     * Obtener todas las transacciones bancarias con filtros (soporta paginación).
     * Filtro "Sugerencias" (PARTIALLY_MATCHED): incluye PARTIALLY_MATCHED y PENDING con sugerencia pendiente (Sum/Split).
     */
    async getAllTransactions(filters: TransactionFilters = {}) {
        let where = this.buildWhere(filters);
        if (filters.status === 'PARTIALLY_MATCHED') {
            const rows = await this.prisma.matchSuggestion.findMany({
                where: { status: 'PENDING', organizationId: filters.organizationId },
                select: { transactionIds: true },
            });
            const suggestionTxIds = [...new Set(rows.flatMap((r) => (r.transactionIds as string[]) || []))];
            const { status: _s, ...rest } = where;
            where = {
                ...rest,
                OR: [
                    { ...rest, status: 'PARTIALLY_MATCHED' },
                    ...(suggestionTxIds.length > 0
                        ? [{ ...rest, status: 'PENDING', id: { in: suggestionTxIds } }]
                        : []),
                ],
            } as any;
        }
        const page = filters.page ? parseInt(filters.page.toString(), 10) : undefined;
        const limit = filters.limit ? parseInt(filters.limit.toString(), 10) : undefined;

        const [total, transactions] = await Promise.all([
            this.prisma.bankTransaction.count({ where }),
            this.prisma.bankTransaction.findMany({
                where,
                include: {
                    bankAccount: { select: { bankName: true, accountNumber: true } },
                    matches: {
                        where: { status: { in: ['CONFIRMED', 'DRAFT'] } },
                        include: {
                            dte: {
                                select: {
                                    id: true, folio: true, type: true, totalAmount: true,
                                    outstandingAmount: true, issuedDate: true, dueDate: true,
                                    rutIssuer: true, paymentStatus: true,
                                    provider: { select: { id: true, name: true, rut: true } },
                                },
                            },
                            payment: { select: { id: true, amount: true } },
                        },
                    },
                },
                orderBy: filters.sortBy && ['amount', 'date', 'description'].includes(filters.sortBy)
                    ? { [filters.sortBy]: filters.order || 'asc' }
                    : { date: 'asc' },
                skip: page && limit ? (page - 1) * limit : undefined,
                take: limit,
            }),
        ]);

        const txIds = new Set(transactions.map((t) => t.id));
        const pendingSuggestions =
            txIds.size > 0
                ? await this.prisma.matchSuggestion.findMany({
                      where: { status: 'PENDING', organizationId: filters.organizationId },
                      include: {
                          dte: {
                              select: {
                                  id: true,
                                  folio: true,
                                  type: true,
                                  totalAmount: true,
                                  provider: { select: { name: true, rut: true } },
                              },
                          },
                      },
                  })
                : [];
        const txIdToSuggestion = new Map<string, { id: string; type: string; confidence: number; dte: any; transactionIds: string[]; relatedDteIds?: string[] }>();
        for (const s of pendingSuggestions) {
            const ids = (s.transactionIds as string[]) || [];
            for (const id of ids) {
                if (txIds.has(id)) txIdToSuggestion.set(id, { id: s.id, type: s.type, confidence: s.confidence, dte: (s as any).dte, transactionIds: ids, relatedDteIds: (s.relatedDteIds as any) || undefined });
            }
        }

        const data = transactions.map((tx) => {
            const activeMatches = [...tx.matches].sort((a, b) => {
                const order = (s: string) => (s === 'CONFIRMED' ? 0 : s === 'DRAFT' ? 1 : 2);
                return order(a.status) - order(b.status) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
            const pendingSuggestion = txIdToSuggestion.get(tx.id);
            return {
                ...tx,
                matches: activeMatches,
                hasMatch: activeMatches.length > 0,
                matchCount: activeMatches.length,
                pendingSuggestion: pendingSuggestion
                    ? {
                          id: pendingSuggestion.id,
                          type: pendingSuggestion.type,
                          confidence: pendingSuggestion.confidence,
                          providerName: pendingSuggestion.dte?.provider?.name,
                          folio: pendingSuggestion.dte?.folio,
                          dteType: pendingSuggestion.dte?.type,
                          totalAmount: pendingSuggestion.dte?.totalAmount,
                      }
                    : undefined,
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

    async createTransaction(organizationId: string, data: { bankAccountId: string; date: string; description: string; amount: number; type: 'CREDIT' | 'DEBIT', sourceFile?: string }) {
        const account = await this.prisma.bankAccount.findUnique({
            where: { id: data.bankAccountId },
            select: { organizationId: true }
        });
        if (!account || account.organizationId !== organizationId) {
            throw new Error('Cuenta bancaria no encontrada o no pertenece a su organización.');
        }

        return this.prisma.bankTransaction.create({
            data: {
                bankAccountId: data.bankAccountId,
                date: new Date(data.date),
                description: data.description,
                amount: data.amount,
                type: data.type,
                status: 'PENDING',
                metadata: { manual: true, createdAt: new Date(), ...(data.sourceFile ? { sourceFile: data.sourceFile } : {}) },
            }
        });
    }

    /**
     * Obtener resumen de transacciones con estadísticas de anotaciones
     */
    async getTransactionsSummary(filters: TransactionFilters = {}) {
        const cacheKey = `tx-summary:${JSON.stringify(filters)}`;
        return this.cache.getOrFetch(cacheKey, CACHE_TTL, async () => {
            const where = this.buildWhere(filters);

            const [agg, statusCounts] = await Promise.all([
                this.prisma.bankTransaction.aggregate({
                    where,
                    _count: true,
                    _sum: { amount: true },
                }),
                this.prisma.bankTransaction.groupBy({
                    by: ['type', 'status'],
                    where,
                    _count: true,
                    _sum: { amount: true },
                }),
            ]);

            const total = agg._count;
            let totalDebits = 0, totalCredits = 0, matched = 0;
            const byStatus = { PENDING: 0, MATCHED: 0, PARTIALLY_MATCHED: 0, UNMATCHED: 0 };

            for (const g of statusCounts) {
                if (g.type === 'DEBIT') totalDebits += Math.abs(g._sum.amount || 0);
                if (g.type === 'CREDIT') totalCredits += (g._sum.amount || 0);
                if (g.status === 'MATCHED' || g.status === 'PARTIALLY_MATCHED') matched += g._count;
                if (g.status in byStatus) byStatus[g.status] += g._count;
            }

            return {
                total,
                totalDebits,
                totalCredits,
                netFlow: totalCredits - totalDebits,
                byStatus,
                matched,
                unmatched: total - matched,
                matchRate: total > 0 ? (matched / total) * 100 : 0,
            };
        });
    }

    /**
     * Obtener transacciones sin conciliar
     */
    async getUnmatchedTransactions(organizationId?: string, limit: number = 50) {
        const minDate = this.visibility.getVisibleFromDate();
        const transactions = await this.prisma.bankTransaction.findMany({
            where: {
                status: {
                    in: ['PENDING', 'UNMATCHED'],
                },
                ...(organizationId && { bankAccount: { organizationId } }),
                ...(minDate && { date: { gte: minDate } }),
            },
            include: {
                bankAccount: true,
            },
            orderBy: [{ date: 'asc' }, { amount: 'desc' }],
            take: limit,
        });

        return transactions;
    }

    /**
     * Limpieza total: borra todas las transacciones, matches y sugerencias.
     * Resetea todos los DTEs a UNPAID (outstandingAmount = totalAmount) para volver a conciliar.
     * Mantiene proveedores (y sus RUTs). Desvincula PaymentRecord de transacciones.
     * Opcional: borrar cuentas bancarias para que al subir cartolas se creen de nuevo.
     */
    async cleanupAllExceptProviders(organizationId: string, deleteBankAccounts = false) {
        if (!organizationId) throw new Error('organizationId es requerido para limpieza.');

        const [delMatches, delSuggestions] = await Promise.all([
            this.prisma.reconciliationMatch.deleteMany({ where: { organizationId } }),
            this.prisma.matchSuggestion.deleteMany({ where: { organizationId } }),
        ]);
        await this.prisma.paymentRecord.updateMany({
            where: { organizationId, transactionId: { not: null } },
            data: { transactionId: null },
        });
        const delTx = await this.prisma.bankTransaction.deleteMany({
            where: { bankAccount: { organizationId } }
        });
        let delAccounts = 0;
        if (deleteBankAccounts) {
            delAccounts = (await this.prisma.bankAccount.deleteMany({ where: { organizationId } })).count;
        }
        // Dejar todos los DTEs como no pagados para volver a conciliar movimiento por movimiento
        const updated = await this.prisma.$executeRawUnsafe(
            `UPDATE dtes SET "paymentStatus" = 'UNPAID', "outstandingAmount" = "totalAmount" WHERE "organizationId" = $1`,
            organizationId
        );
        this.cache.invalidate('tx-summary');
        this.cache.invalidate('bank-accounts');
        this.logger.log(`Cleanup total for org ${organizationId}: ${delTx.count} tx, ${delMatches.count} matches, ${delSuggestions.count} suggestions, DTEs reset: ${updated}`);
        return {
            deletedTransactions: delTx.count,
            deletedMatches: delMatches.count,
            deletedSuggestions: delSuggestions.count,
            resetDtesToUnpaid: Number(updated),
            deletedBankAccounts: delAccounts,
        };
    }

    /**
     * Lista TODAS las cartolas (sourceFile) en la base de datos, con cuenta bancaria y conteo.
     * Sirve para decidir qué 6 archivos mantener (3 CC + 3 TC) antes de la limpieza.
     */
    async getAllSourceFiles(organizationId?: string): Promise<{
        filename: string;
        bankAccountId: string;
        bankName: string;
        accountNumber: string;
        count: number;
    }[]> {
        const query = `
            SELECT metadata->>'sourceFile' AS filename, bt."bankAccountId", ba."bankName", ba."accountNumber", COUNT(*)::bigint AS count
            FROM bank_transactions bt
            JOIN bank_accounts ba ON ba.id = bt."bankAccountId"
            WHERE metadata->>'sourceFile' IS NOT NULL AND metadata->>'sourceFile' != ''
            ${organizationId ? 'AND ba."organizationId" = $1' : ''}
            GROUP BY metadata->>'sourceFile', bt."bankAccountId", ba."bankName", ba."accountNumber"
            ORDER BY ba."bankName", filename
        `;
        const rows = organizationId 
            ? await this.prisma.$queryRawUnsafe<any>(query, organizationId)
            : await this.prisma.$queryRawUnsafe<any>(query);

        return rows.map((r: any) => ({
            filename: r.filename,
            bankAccountId: r.bankAccountId,
            bankName: r.bankName,
            accountNumber: r.accountNumber,
            count: Number(r.count),
        }));
    }

    /**
     * Limpieza de cartolas: elimina todas las transacciones cuyo sourceFile NO está en keepSourceFiles.
     * Mantiene proveedores y DTEs; revierte estado de pago de DTEs que solo tenían match con tx eliminadas.
     */
    async cleanupCartolasExcept(organizationId: string, keepSourceFiles: string[]) {
        if (!organizationId) throw new Error('organizationId es requerido para limpieza.');
        const keep = keepSourceFiles.map((f) => f.trim()).filter(Boolean);
        if (keep.length === 0) {
            throw new Error('keepSourceFiles no puede estar vacío. Indica al menos un archivo a mantener.');
        }

        // sourceFile NULL, vacío o que no esté en la lista a mantener
        const placeholders = keep.map((_, i) => `$${i + 2}`).join(', ');
        const idsResult = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
            `SELECT bt.id FROM bank_transactions bt 
             JOIN bank_accounts ba ON ba.id = bt."bankAccountId" 
             WHERE ba."organizationId" = $1 
             AND (bt.metadata->>'sourceFile' IS NULL OR bt.metadata->>'sourceFile' = '' OR bt.metadata->>'sourceFile' NOT IN (${placeholders}))`,
            organizationId,
            ...keep,
        );
        const idsToDelete = idsResult.map((r) => r.id);

        if (idsToDelete.length === 0) {
            return { deletedTransactions: 0, deletedMatches: 0, deletedSuggestions: 0, resetDtes: 0 };
        }

        const dteIdsToReset = await this.prisma.reconciliationMatch.findMany({
            where: { transactionId: { in: idsToDelete }, dteId: { not: null } },
            select: { dteId: true },
        });
        const uniqueDteIds = [...new Set((dteIdsToReset.map((m) => m.dteId).filter(Boolean) as string[]))];

        const result = await this.prisma.$transaction(async (tx) => {
            const matchIds = await tx.reconciliationMatch.findMany({
                where: { transactionId: { in: idsToDelete } },
                select: { id: true },
            }).then((rows) => rows.map((r) => r.id));
            if (matchIds.length > 0) {
                await tx.balanceAdjustment.updateMany({
                    where: { matchId: { in: matchIds } },
                    data: { matchId: null },
                });
            }
            const delMatches = await tx.reconciliationMatch.deleteMany({
                where: { transactionId: { in: idsToDelete } },
            });
            const suggestions = await tx.matchSuggestion.findMany({
                where: { status: 'PENDING' },
                select: { id: true, transactionIds: true },
            });
            const toDeleteSuggestionIds: string[] = [];
            for (const s of suggestions) {
                const txIds = (s.transactionIds as string[]) || [];
                if (txIds.some((tid) => idsToDelete.includes(tid))) toDeleteSuggestionIds.push(s.id);
            }
            let deletedSuggestions = 0;
            if (toDeleteSuggestionIds.length > 0) {
                deletedSuggestions = (await tx.matchSuggestion.deleteMany({ where: { id: { in: toDeleteSuggestionIds } } })).count;
            }

            await tx.paymentRecord.updateMany({
                where: { transactionId: { in: idsToDelete } },
                data: { transactionId: null },
            });

            await tx.bankTransaction.deleteMany({
                where: { id: { in: idsToDelete } },
            });

            return {
                deletedTransactions: idsToDelete.length,
                deletedMatches: delMatches.count,
                deletedSuggestions,
            };
        });

        let resetDtes = 0;
        for (const dteId of uniqueDteIds) {
            const otherMatch = await this.prisma.reconciliationMatch.findFirst({
                where: { dteId, status: 'CONFIRMED' },
            });
            if (!otherMatch) {
                const dte = await this.prisma.dTE.findUnique({ where: { id: dteId } });
                if (dte) {
                    await this.prisma.dTE.update({
                        where: { id: dteId },
                        data: { paymentStatus: 'UNPAID', outstandingAmount: dte.totalAmount },
                    });
                    resetDtes++;
                }
            }
        }

        const resultWithReset = { ...result, resetDtes };
        this.cache.invalidate('tx-summary');
        this.cache.invalidate('bank-accounts');
        this.logger.log(`Cleanup cartolas: ${JSON.stringify(resultWithReset)}`);
        return resultWithReset;
    }

    /**
     * Elimina todos los movimientos de una cartola por nombre de archivo (sourceFile).
     * Útil cuando la carga falló a medias (ej. 0 movimientos insertados) y se quiere forzar una nueva carga desde cero.
     * Elimina matches y sugerencias asociadas; revierte estado de pago de DTEs que solo tenían match con esas tx.
     */
    async deleteTransactionsBySourceFile(organizationId: string, sourceFile: string): Promise<{
        deletedTransactions: number;
        deletedMatches: number;
        deletedSuggestions: number;
        resetDtes: number;
    }> {
        if (!organizationId) throw new Error('organizationId es requerido.');
        const filename = sourceFile?.trim();
        if (!filename) {
            throw new Error('sourceFile es requerido (ej. "Cartola Santander Enero 2026.pdf").');
        }

        let idsToDelete: string[];
        try {
            const idsResult = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
                `SELECT bt.id FROM bank_transactions bt 
                 JOIN bank_accounts ba ON ba.id = bt."bankAccountId" 
                 WHERE ba."organizationId" = $1 AND bt.metadata->>'sourceFile' = $2`,
                organizationId,
                filename,
            );
            idsToDelete = idsResult.map((r) => r.id);
        } catch (err: any) {
            this.logger.error(`deleteTransactionsBySourceFile: raw query failed: ${err?.message}`, err?.stack);
            throw err;
        }

        if (idsToDelete.length === 0) {
            this.logger.log(`No hay movimientos con sourceFile="${filename}". Nada que eliminar.`);
            return { deletedTransactions: 0, deletedMatches: 0, deletedSuggestions: 0, resetDtes: 0 };
        }

        const dteIdsToReset = await this.prisma.reconciliationMatch.findMany({
            where: { transactionId: { in: idsToDelete }, dteId: { not: null } },
            select: { dteId: true },
        });
        const uniqueDteIds = [...new Set((dteIdsToReset.map((m) => m.dteId).filter(Boolean) as string[]))];

        let result: { deletedTransactions: number; deletedMatches: number; deletedSuggestions: number };
        try {
            result = await this.prisma.$transaction(async (tx) => {
                // Desvincular BalanceAdjustment que apuntan a estos matches (evita error FK al borrar)
                const matchIds = await tx.reconciliationMatch.findMany({
                    where: { transactionId: { in: idsToDelete } },
                    select: { id: true },
                }).then((rows) => rows.map((r) => r.id));
                if (matchIds.length > 0) {
                    await tx.balanceAdjustment.updateMany({
                        where: { matchId: { in: matchIds } },
                        data: { matchId: null },
                    });
                }
                const delMatches = await tx.reconciliationMatch.deleteMany({
                where: { transactionId: { in: idsToDelete } },
            });
            const suggestions = await tx.matchSuggestion.findMany({
                where: { status: 'PENDING' },
                select: { id: true, transactionIds: true },
            });
            const toDeleteSuggestionIds: string[] = [];
            for (const s of suggestions) {
                const txIds = (s.transactionIds as string[]) || [];
                if (txIds.some((tid) => idsToDelete.includes(tid))) toDeleteSuggestionIds.push(s.id);
            }
            let deletedSuggestions = 0;
            if (toDeleteSuggestionIds.length > 0) {
                deletedSuggestions = (await tx.matchSuggestion.deleteMany({ where: { id: { in: toDeleteSuggestionIds } } })).count;
            }

            await tx.paymentRecord.updateMany({
                where: { transactionId: { in: idsToDelete } },
                data: { transactionId: null },
            });

            await tx.bankTransaction.deleteMany({
                where: { id: { in: idsToDelete } },
            });

                return {
                    deletedTransactions: idsToDelete.length,
                    deletedMatches: delMatches.count,
                    deletedSuggestions,
                };
            });
        } catch (err: any) {
            this.logger.error(`deleteTransactionsBySourceFile: transaction failed: ${err?.message}`, err?.stack);
            throw err;
        }

        // Reseteo de DTEs fuera de la transacción para evitar timeout/transaction closed de Prisma
        let resetDtes = 0;
        for (const dteId of uniqueDteIds) {
            const otherMatch = await this.prisma.reconciliationMatch.findFirst({
                where: { dteId, status: 'CONFIRMED' },
            });
            if (!otherMatch) {
                const dte = await this.prisma.dTE.findUnique({ where: { id: dteId } });
                if (dte) {
                    await this.prisma.dTE.update({
                        where: { id: dteId },
                        data: { paymentStatus: 'UNPAID', outstandingAmount: dte.totalAmount },
                    });
                    resetDtes++;
                }
            }
        }

        const resultWithReset = {
            ...result,
            resetDtes,
        };

        this.cache.invalidate('tx-summary');
        this.cache.invalidate('bank-accounts');
        this.logger.log(`Eliminada cartola "${filename}": ${JSON.stringify(resultWithReset)}`);
        return resultWithReset;
    }

    /**
     * Obtener nombres de cartolas (archivos) que tienen movimientos en el periodo.
     * Incluye también __NO_SOURCE_FILE__ si hay movimientos en el periodo sin sourceFile (ej. otra fuente).
     */
    async getFilesInPeriod(organizationId: string, fromDate?: string, toDate?: string): Promise<{ filename: string }[]> {
        const minDate = this.visibility.applyMinDate(
            fromDate ? new Date(fromDate) : undefined,
        );
        const from = minDate ?? (fromDate ? new Date(fromDate) : undefined);
        const to = toDate ? new Date(toDate) : undefined;
        // if (!from && !to) return []; // Removed to allow listing all for org

        const where: string[] = [`ba."organizationId" = $1`];
        const params: (string | Date)[] = [organizationId];
        
        if (from) {
            params.push(from);
            where.push(`bt.date >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            where.push(`bt.date <= $${params.length}`);
        }
        where.push("(bt.metadata->>'sourceFile' IS NOT NULL AND bt.metadata->>'sourceFile' != '')");

        const result = await this.prisma.$queryRawUnsafe<{ filename: string }[]>(
            `SELECT DISTINCT bt.metadata->>'sourceFile' AS filename 
             FROM bank_transactions bt 
             JOIN bank_accounts ba ON ba.id = bt."bankAccountId" 
             WHERE ${where.join(' AND ')} ORDER BY filename`,
            ...params,
        );

        // Incluir opción "otros movimientos" si hay transacciones en el periodo sin sourceFile
        const whereNoFile: string[] = [];
        const paramsNoFile: (string | Date)[] = [];
        if (from) {
            paramsNoFile.push(from);
            whereNoFile.push(`date >= $${paramsNoFile.length}`);
        }
        if (to) {
            paramsNoFile.push(to);
            whereNoFile.push(`date <= $${paramsNoFile.length}`);
        }
        whereNoFile.push("(metadata->>'sourceFile' IS NULL OR metadata->>'sourceFile' = '')");
        const countNoFile = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
            `SELECT COUNT(*) AS count FROM bank_transactions WHERE ${whereNoFile.join(' AND ')}`,
            ...paramsNoFile,
        );
        const hasNoSourceFile = Number(countNoFile[0]?.count ?? 0) > 0;
        if (hasNoSourceFile) {
            result.push({ filename: '__NO_SOURCE_FILE__' });
        }
        return result;
    }

    /**
     * Obtener cuentas bancarias
     */
    async getBankAccounts(organizationId: string) {
        return this.cache.getOrFetch(`bank-accounts:${organizationId}`, 60_000, () =>
            this.prisma.bankAccount.findMany({
                where: { organizationId, isActive: true },
                include: { _count: { select: { transactions: true } } },
            }),
        );
    }

    async annotateTransaction(
        organizationId: string,
        id: string,
        annotation: { empresa?: string; detalle?: string; comentario?: string; folio?: string },
    ) {
        const tx = await this.prisma.bankTransaction.findUnique({
            where: { id },
            include: { bankAccount: true },
        });
        if (!tx || tx.bankAccount.organizationId !== organizationId) throw new Error('Transaccion no encontrada');

        const meta = (tx.metadata as Record<string, any>) || {};
        if (annotation.empresa !== undefined) meta.empresaExcel = annotation.empresa;
        if (annotation.detalle !== undefined) meta.detalleExcel = annotation.detalle;
        if (annotation.comentario !== undefined) meta.comentarioExcel = annotation.comentario;
        if (annotation.folio !== undefined) meta.folioExcel = annotation.folio;

        return this.prisma.bankTransaction.update({
            where: { id },
            data: { metadata: meta },
            select: { id: true, metadata: true },
        });
    }

    async markAsReviewed(organizationId: string, id: string, note: string, providerId?: string, newProviderName?: string, ruleId?: string) {
        const tx = await this.prisma.bankTransaction.findUnique({
            where: { id },
             include: { bankAccount: true },
        });
        if (!tx || tx.bankAccount.organizationId !== organizationId) throw new Error('Transacción no encontrada');

        let finalProviderId = providerId;
        let categoryName = null;

        if (ruleId) {
            const rule = await this.prisma.autoCategoryRule.findUnique({ where: { id: ruleId } });
            if (rule && rule.organizationId === organizationId) {
                categoryName = rule.categoryName;
                if (!finalProviderId && rule.providerId) finalProviderId = rule.providerId;
            }
        }

        const meta = (tx.metadata as Record<string, any>) || {};
        meta.reviewNote = note || (categoryName ? `[Auto: ${categoryName}]` : undefined);
        meta.reviewedAt = new Date().toISOString();
        if (ruleId && categoryName) {
            meta.autoCategorized = true;
            meta.ruleId = ruleId;
        }

        if (!finalProviderId && newProviderName && newProviderName.trim()) {
             const nameTrim = newProviderName.trim();
             let provider = await this.prisma.provider.findFirst({
                 where: { name: { equals: nameTrim, mode: 'insensitive' } }
             });

             if (!provider) {
                 this.logger.log(`Auto-creating provider profile for review: ${nameTrim}`);
                 const mockRut = `AUTO-${Date.now()}`;
                 provider = await this.prisma.provider.create({
                     data: {
                         name: nameTrim,
                         rut: mockRut,
                         organizationId: tx.bankAccount?.organizationId || null
                     }
                 });
             }
             finalProviderId = provider.id;
        }

        if (finalProviderId) {
            // Guardar el alias para futuras cargas
            await this.prisma.providerAlias.upsert({
                where: {
                    description_providerId: {
                        description: tx.description,
                        providerId: finalProviderId
                    }
                },
                update: {},
                create: {
                    description: tx.description,
                    providerId: finalProviderId
                }
            });

            // Timbrar en la metadata actual para el listado actual
            const provider = await this.prisma.provider.findUnique({
                where: { id: finalProviderId },
                select: { name: true }
            });

            if (provider) {
                meta.providerId = finalProviderId;
                meta.providerName = provider.name;
            }
        }

        const result = await this.prisma.bankTransaction.update({
            where: { id },
            data: {
                status: ruleId ? 'MATCHED' : 'UNMATCHED',
                metadata: meta,
            },
        });
        this.cache.invalidate('tx-summary');
        return result;
    }

    /**
     * Corregir tipo de movimiento (Cargo ↔ Abono). Invierte el signo del monto para que coincida.
     */
    async updateTransactionType(organizationId: string, id: string, type: 'CREDIT' | 'DEBIT') {
        const tx = await this.prisma.bankTransaction.findUnique({
            where: { id },
            include: { bankAccount: true },
        });
        if (!tx || tx.bankAccount.organizationId !== organizationId) throw new Error('Transacción no encontrada');

        const newAmount = type === tx.type ? tx.amount : -tx.amount;
        const result = await this.prisma.bankTransaction.update({
            where: { id },
            data: { type, amount: newAmount },
        });
        this.cache.invalidate('tx-summary');
        return result;
    }

    /**
     * Corregir el monto de una transacción (debido a errores de OCR).
     */
    async updateTransactionAmount(organizationId: string, id: string, amount: number) {
        const tx = await this.prisma.bankTransaction.findUnique({
            where: { id },
            include: { bankAccount: true },
        });
        if (!tx || tx.bankAccount.organizationId !== organizationId) throw new Error('Transacción no encontrada');

        const result = await this.prisma.bankTransaction.update({
             where: { id },
             data: { amount }
        });
        this.cache.invalidate('tx-summary');
        return result;
    }
}
