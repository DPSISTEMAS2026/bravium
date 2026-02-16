import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface TransactionFilters {
    fromDate?: string;
    toDate?: string;
    bankAccountId?: string;
    type?: string;
    status?: string;
    minAmount?: number;
    maxAmount?: number;
}

@Injectable()
export class TransactionsService {
    private readonly logger = new Logger(TransactionsService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Obtener todas las transacciones bancarias con filtros
     */
    async getAllTransactions(filters: TransactionFilters = {}) {
        const where: any = {};

        if (filters.fromDate || filters.toDate) {
            where.date = {};
            if (filters.fromDate) {
                where.date.gte = new Date(filters.fromDate);
            }
            if (filters.toDate) {
                where.date.lte = new Date(filters.toDate);
            }
        }

        if (filters.bankAccountId) {
            where.bankAccountId = filters.bankAccountId;
        }

        if (filters.type) {
            where.type = filters.type;
        }

        if (filters.status) {
            where.status = filters.status;
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

        const transactions = await this.prisma.bankTransaction.findMany({
            where,
            include: {
                bankAccount: true,
                matches: {
                    include: {
                        dte: {
                            include: {
                                provider: true,
                            },
                        },
                        payment: true,
                    },
                },
            },
            orderBy: {
                date: 'desc',
            },
        });

        return transactions.map((tx) => ({
            ...tx,
            hasMatch: tx.matches.length > 0,
            matchCount: tx.matches.length,
        }));
    }

    /**
     * Obtener resumen de transacciones
     */
    async getTransactionsSummary(filters: TransactionFilters = {}) {
        const transactions = await this.getAllTransactions(filters);

        const total = transactions.length;
        const totalDebits = transactions
            .filter((t) => t.type === 'DEBIT')
            .reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const totalCredits = transactions
            .filter((t) => t.type === 'CREDIT')
            .reduce((sum, t) => sum + t.amount, 0);

        const byStatus = {
            PENDING: transactions.filter((t) => t.status === 'PENDING').length,
            MATCHED: transactions.filter((t) => t.status === 'MATCHED').length,
            PARTIALLY_MATCHED: transactions.filter(
                (t) => t.status === 'PARTIALLY_MATCHED'
            ).length,
            UNMATCHED: transactions.filter((t) => t.status === 'UNMATCHED').length,
        };

        const matched = transactions.filter((t) => t.hasMatch).length;
        const unmatched = total - matched;

        return {
            total,
            totalDebits,
            totalCredits,
            netFlow: totalCredits - totalDebits,
            byStatus,
            matched,
            unmatched,
            matchRate: total > 0 ? (matched / total) * 100 : 0,
        };
    }

    /**
     * Obtener transacciones sin conciliar
     */
    async getUnmatchedTransactions(limit: number = 50) {
        const transactions = await this.prisma.bankTransaction.findMany({
            where: {
                status: {
                    in: ['PENDING', 'UNMATCHED'],
                },
            },
            include: {
                bankAccount: true,
            },
            orderBy: [{ date: 'desc' }, { amount: 'desc' }],
            take: limit,
        });

        return transactions;
    }

    /**
     * Obtener cuentas bancarias
     */
    async getBankAccounts() {
        return this.prisma.bankAccount.findMany({
            where: {
                isActive: true,
            },
            include: {
                _count: {
                    select: {
                        transactions: true,
                    },
                },
            },
        });
    }
}
