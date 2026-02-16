import { Controller, Get, Query, Logger } from '@nestjs/common';
import { TransactionsService, TransactionFilters } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
    private readonly logger = new Logger(TransactionsController.name);

    constructor(private readonly transactionsService: TransactionsService) { }

    /**
     * GET /transactions
     * Lista todas las transacciones bancarias con filtros
     */
    @Get()
    async getAllTransactions(
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
        @Query('bankAccountId') bankAccountId?: string,
        @Query('type') type?: string,
        @Query('status') status?: string,
        @Query('minAmount') minAmount?: string,
        @Query('maxAmount') maxAmount?: string
    ) {
        const filters: TransactionFilters = {
            fromDate,
            toDate,
            bankAccountId,
            type,
            status,
            minAmount: minAmount ? parseInt(minAmount, 10) : undefined,
            maxAmount: maxAmount ? parseInt(maxAmount, 10) : undefined,
        };

        this.logger.log(
            `Fetching transactions with filters: ${JSON.stringify(filters)}`
        );
        return this.transactionsService.getAllTransactions(filters);
    }

    /**
     * GET /transactions/summary
     * Resumen de transacciones
     */
    @Get('summary')
    async getTransactionsSummary(
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
        @Query('bankAccountId') bankAccountId?: string
    ) {
        const filters: TransactionFilters = {
            fromDate,
            toDate,
            bankAccountId,
        };

        this.logger.log(
            `Fetching transactions summary with filters: ${JSON.stringify(filters)}`
        );
        return this.transactionsService.getTransactionsSummary(filters);
    }

    /**
     * GET /transactions/unmatched
     * Transacciones sin conciliar
     */
    @Get('unmatched')
    async getUnmatchedTransactions(@Query('limit') limit?: string) {
        const limitNum = limit ? parseInt(limit, 10) : 50;
        this.logger.log(`Fetching unmatched transactions (limit: ${limitNum})`);
        return this.transactionsService.getUnmatchedTransactions(limitNum);
    }

    /**
     * GET /transactions/bank-accounts
     * Obtener cuentas bancarias
     */
    @Get('bank-accounts')
    async getBankAccounts() {
        this.logger.log('Fetching bank accounts');
        return this.transactionsService.getBankAccounts();
    }
}
