import { Controller, Get, Post, Patch, Query, Param, Body, Req, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { TransactionsService, TransactionFilters } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
    private readonly logger = new Logger(TransactionsController.name);

    constructor(private readonly transactionsService: TransactionsService) { }

    /**
     * GET /transactions/source-files-all
     * Lista todas las cartolas (archivos) en la BD con cuenta bancaria y conteo.
     * Para elegir qué 6 mantener (3 CC + 3 TC) antes de la limpieza.
     */
    @Get('source-files-all')
    async getAllSourceFiles() {
        return this.transactionsService.getAllSourceFiles();
    }

    /**
     * POST /transactions/cleanup-cartolas
     * Limpieza: elimina transacciones de cartolas que NO están en keepSourceFiles.
     * Body: { keepSourceFiles: string[] } (nombres exactos de archivo, ej. "Cartola CC Ene 2026.xlsx").
     * Mantiene proveedores y RUTs; revierte estado de pago de DTEs que perdieron su match.
     */
    /**
     * POST /transactions/cleanup-all
     * Limpieza total: borra todas las transacciones, matches y sugerencias. Mantiene proveedores.
     * Body: { deleteBankAccounts?: boolean } — si true, también borra cuentas bancarias.
     */
    @Post('cleanup-all')
    async cleanupAll(@Body() body: { deleteBankAccounts?: boolean } = {}) {
        this.logger.warn('Ejecutando limpieza total (mantiene proveedores).');
        return this.transactionsService.cleanupAllExceptProviders(!!body.deleteBankAccounts);
    }

    @Post('cleanup-cartolas')
    async cleanupCartolas(@Body() body: { keepSourceFiles: string[] }) {
        if (!body.keepSourceFiles || !Array.isArray(body.keepSourceFiles)) {
            throw new BadRequestException('Se requiere body.keepSourceFiles (array de nombres de archivo a mantener).');
        }
        return this.transactionsService.cleanupCartolasExcept(body.keepSourceFiles);
    }

    /**
     * POST /transactions/delete-cartola
     * Elimina todos los movimientos de una cartola por nombre de archivo.
     * Útil cuando la carga reportó "0 movimientos insertados" y se quiere forzar una nueva carga.
     * Body: { sourceFile: string } (ej. "Cartola Santander Enero 2026.pdf")
     */
    @Post('delete-cartola')
    async deleteCartola(@Body() body: { sourceFile: string }) {
        if (!body?.sourceFile || typeof body.sourceFile !== 'string') {
            throw new BadRequestException('Se requiere body.sourceFile (nombre exacto del archivo, ej. "Cartola Santander Enero 2026.pdf").');
        }
        try {
            return await this.transactionsService.deleteTransactionsBySourceFile(body.sourceFile);
        } catch (err: any) {
            this.logger.error(`delete-cartola failed: ${err?.message}`, err?.stack);
            throw new InternalServerErrorException(
                err?.message || 'Error al eliminar la cartola. Revisa los logs del backend.',
            );
        }
    }

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
        @Query('maxAmount') maxAmount?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
        @Query('filename') filename?: string,
        @Query('sortBy') sortBy?: string,
        @Query('order') order?: 'asc' | 'desc'
    ) {
        const filters: TransactionFilters = {
            fromDate,
            toDate,
            bankAccountId,
            type,
            status,
            minAmount: minAmount ? parseInt(minAmount, 10) : undefined,
            maxAmount: maxAmount ? parseInt(maxAmount, 10) : undefined,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            search,
            filename,
            sortBy,
            order
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
     * POST /transactions
     * Crear un movimiento manual en la cartola
     */
    @Post()
    async createTransaction(
        @Body() body: { bankAccountId: string; date: string; description: string; amount: number; type: 'CREDIT' | 'DEBIT'; sourceFile?: string }
    ) {
        return this.transactionsService.createTransaction(body);
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

    /**
     * GET /transactions/files-in-period
     * Cartolas (archivos) que tienen movimientos en el periodo (solo visibles en ese rango)
     */
    @Get('files-in-period')
    async getFilesInPeriod(
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
    ) {
        return this.transactionsService.getFilesInPeriod(fromDate, toDate);
    }

    /**
     * PATCH /transactions/:id/annotate
     * Agregar o editar anotacion en una transaccion
     */
    @Patch(':id/annotate')
    async annotateTransaction(
        @Param('id') id: string,
        @Body() body: { empresa?: string; detalle?: string; comentario?: string; folio?: string },
    ) {
        return this.transactionsService.annotateTransaction(id, body);
    }

    /**
     * PATCH /transactions/:id/review
     * Marcar transacción como revisada (sin DTE esperado)
     */
    @Patch(':id/review')
    async reviewTransaction(
        @Param('id') id: string,
        @Body() body: { note: string; providerId?: string; newProviderName?: string },
    ) {
        this.logger.log(`Marking transaction ${id} as reviewed. Note: ${body.note}, Prov: ${body.providerId}, NewProv: ${body.newProviderName}`);
        return this.transactionsService.markAsReviewed(id, body.note, body.providerId, body.newProviderName);
    }

    /**
     * PATCH /transactions/:id/type
     * Corregir tipo de movimiento: Cargo (DEBIT) ↔ Abono (CREDIT). Ajusta el signo del monto.
     */
    @Patch(':id/type')
    async updateTransactionType(
        @Param('id') id: string,
        @Body() body: { type: 'CREDIT' | 'DEBIT' },
    ) {
        if (!body?.type || !['CREDIT', 'DEBIT'].includes(body.type)) {
            throw new BadRequestException('Se requiere body.type: "CREDIT" o "DEBIT".');
        }
        return this.transactionsService.updateTransactionType(id, body.type);
    }

    /**
     * PATCH /transactions/:id/amount
     * Corregir el monto de una transacción por errores de OCR/Ingesta.
     */
    @Patch(':id/amount')
    async updateTransactionAmount(
        @Param('id') id: string,
        @Body() body: { amount: number },
    ) {
        if (body?.amount === undefined || isNaN(Number(body.amount))) {
            throw new BadRequestException('Se requiere body.amount válido.');
        }
        return this.transactionsService.updateTransactionAmount(id, Number(body.amount));
    }
}
