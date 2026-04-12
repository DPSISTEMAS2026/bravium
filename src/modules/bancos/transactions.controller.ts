import { Controller, Get, Post, Patch, Query, Param, Body, Req, Logger, BadRequestException, InternalServerErrorException, UseGuards } from '@nestjs/common';
import { TransactionsService, TransactionFilters } from './transactions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { Request } from 'express';

@UseGuards(JwtAuthGuard, RolesGuard, OrganizationGuard)
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
    async getAllSourceFiles(@Req() req: Request) {
        const organizationId = (req as any).user?.organizationId;
        return this.transactionsService.getAllSourceFiles(organizationId);
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
    async cleanupAll(@Req() req: Request, @Body() body: { deleteBankAccounts?: boolean } = {}) {
        const organizationId = (req as any).organizationId;
        this.logger.warn(`Ejecutando limpieza total para org ${organizationId} (mantiene proveedores).`);
        return this.transactionsService.cleanupAllExceptProviders(organizationId, !!body.deleteBankAccounts);
    }

    @Post('cleanup-cartolas')
    async cleanupCartolas(@Req() req: Request, @Body() body: { keepSourceFiles: string[] }) {
        if (!body.keepSourceFiles || !Array.isArray(body.keepSourceFiles)) {
            throw new BadRequestException('Se requiere body.keepSourceFiles (array de nombres de archivo a mantener).');
        }
        const organizationId = (req as any).organizationId;
        return this.transactionsService.cleanupCartolasExcept(organizationId, body.keepSourceFiles);
    }

    /**
     * POST /transactions/delete-cartola
     * Elimina todos los movimientos de una cartola por nombre de archivo.
     * Útil cuando la carga reportó "0 movimientos insertados" y se quiere forzar una nueva carga.
     * Body: { sourceFile: string } (ej. "Cartola Santander Enero 2026.pdf")
     */
    @Post('delete-cartola')
    async deleteCartola(@Req() req: Request, @Body() body: { sourceFile: string }) {
        if (!body?.sourceFile || typeof body.sourceFile !== 'string') {
            throw new BadRequestException('Se requiere body.sourceFile (nombre exacto del archivo, ej. "Cartola Santander Enero 2026.pdf").');
        }
        const organizationId = (req as any).organizationId;
        try {
            return await this.transactionsService.deleteTransactionsBySourceFile(organizationId, body.sourceFile);
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
        @Query('order') order?: 'asc' | 'desc',
        @Req() req?: Request
    ) {
        const organizationId = (req as any)?.organizationId;
        const filters: TransactionFilters = {
            organizationId,
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
        @Query('bankAccountId') bankAccountId?: string,
        @Req() req?: Request
    ) {
        const organizationId = (req as any)?.organizationId;
        const filters: TransactionFilters = {
            organizationId,
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
        @Req() req: Request,
        @Body() body: { bankAccountId: string; date: string; description: string; amount: number; type: 'CREDIT' | 'DEBIT'; sourceFile?: string }
    ) {
        const organizationId = (req as any).organizationId;
        return this.transactionsService.createTransaction(organizationId, body);
    }

    /**
     * GET /transactions/unmatched
     * Transacciones sin conciliar
     */
    @Get('unmatched')
    async getUnmatchedTransactions(@Query('limit') limit?: string, @Req() req?: Request) {
        const limitNum = limit ? parseInt(limit, 10) : 50;
        const organizationId = (req as any)?.organizationId;
        this.logger.log(`Fetching unmatched transactions (limit: ${limitNum})`);
        return this.transactionsService.getUnmatchedTransactions(organizationId, limitNum);
    }

    /**
     * GET /transactions/bank-accounts
     * Obtener cuentas bancarias
     */
    @Get('bank-accounts')
    async getBankAccounts(@Req() req: Request) {
        const organizationId = (req as any).organizationId;
        this.logger.log(`Fetching bank accounts for org ${organizationId}`);
        return this.transactionsService.getBankAccounts(organizationId);
    }

    /**
     * GET /transactions/files-in-period
     * Cartolas (archivos) que tienen movimientos en el periodo (solo visibles en ese rango)
     */
    @Get('files-in-period')
    async getFilesInPeriod(
        @Req() req: Request,
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
    ) {
        const organizationId = (req as any).organizationId;
        return this.transactionsService.getFilesInPeriod(organizationId, fromDate, toDate);
    }

    /**
     * PATCH /transactions/:id/annotate
     * Agregar o editar anotacion en una transaccion
     */
    @Patch(':id/annotate')
    async annotateTransaction(
        @Req() req: Request,
        @Param('id') id: string,
        @Body() body: { empresa?: string; detalle?: string; comentario?: string; folio?: string },
    ) {
        const organizationId = (req as any).organizationId;
        return this.transactionsService.annotateTransaction(organizationId, id, body);
    }

    /**
     * PATCH /transactions/:id/review
     * Marcar transacción como revisada (sin DTE esperado)
     */
    @Patch(':id/review')
    async reviewTransaction(
        @Req() req: Request,
        @Param('id') id: string,
        @Body() body: { note: string; providerId?: string; newProviderName?: string },
    ) {
        const organizationId = (req as any).organizationId;
        this.logger.log(`Marking transaction ${id} as reviewed. Note: ${body.note}, Prov: ${body.providerId}, NewProv: ${body.newProviderName}`);
        return this.transactionsService.markAsReviewed(organizationId, id, body.note, body.providerId, body.newProviderName);
    }

    /**
     * PATCH /transactions/:id/type
     * Corregir tipo de movimiento: Cargo (DEBIT) ↔ Abono (CREDIT). Ajusta el signo del monto.
     */
    @Patch(':id/type')
    async updateTransactionType(
        @Req() req: Request,
        @Param('id') id: string,
        @Body() body: { type: 'CREDIT' | 'DEBIT' },
    ) {
        if (!body?.type || !['CREDIT', 'DEBIT'].includes(body.type)) {
            throw new BadRequestException('Se requiere body.type: "CREDIT" o "DEBIT".');
        }
        const organizationId = (req as any).organizationId;
        return this.transactionsService.updateTransactionType(organizationId, id, body.type);
    }

    /**
     * PATCH /transactions/:id/amount
     * Corregir el monto de una transacción por errores de OCR/Ingesta.
     */
    @Patch(':id/amount')
    async updateTransactionAmount(
        @Req() req: Request,
        @Param('id') id: string,
        @Body() body: { amount: number },
    ) {
        if (body?.amount === undefined || isNaN(Number(body.amount))) {
            throw new BadRequestException('Se requiere body.amount válido.');
        }
        const organizationId = (req as any).organizationId;
        return this.transactionsService.updateTransactionAmount(organizationId, id, Number(body.amount));
    }
}
