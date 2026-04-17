import { Controller, Get, Post, Patch, Param, Body, Query, Logger, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { DtesService, DteFilters } from './dtes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrganizationGuard } from '../../common/guards/organization.guard';

@UseGuards(JwtAuthGuard, RolesGuard, OrganizationGuard)
@Controller('dtes')
export class DtesController {
    private readonly logger = new Logger(DtesController.name);

    constructor(private readonly dtesService: DtesService) { }

    /**
     * GET /dtes
     * Lista todos los DTEs con filtros
     */
    @Get()
    async getAllDtes(
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
        @Query('providerId') providerId?: string,
        @Query('paymentStatus') paymentStatus?: string,
        @Query('minAmount') minAmount?: string,
        @Query('maxAmount') maxAmount?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
        @Query('sortBy') sortBy?: string,
        @Query('sortOrder') sortOrder?: 'asc' | 'desc',
        @Query('hasPdf') hasPdf?: string,
        @Query('includeMatched') includeMatched?: string,
        @Query('type') type?: string,
        @Req() req?: Request
    ) {
        const organizationId = (req as any)?.organizationId;
        const filters: DteFilters = {
            organizationId,
            fromDate,
            toDate,
            providerId,
            paymentStatus,
            minAmount: minAmount ? parseInt(minAmount, 10) : undefined,
            maxAmount: maxAmount ? parseInt(maxAmount, 10) : undefined,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            search,
            sortBy,
            sortOrder,
            hasPdf,
            includeMatched: includeMatched === 'true',
            type: type ? parseInt(type, 10) : undefined,
        };

        this.logger.log(`Fetching DTEs with filters: ${JSON.stringify(filters)}`);
        return this.dtesService.getAllDtes(filters);
    }

    /**
     * GET /dtes/conciliated-matches
     * Lista de movimientos conciliados en el período (una fila por match, mismo número que Cartolas).
     */
    @Get('conciliated-matches')
    async getConciliatedMatches(
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Req() req?: Request
    ) {
        const organizationId = (req as any)?.organizationId;
        const filters: DteFilters = {
            organizationId,
            fromDate,
            toDate,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
        };
        this.logger.log(`Fetching conciliated matches: ${JSON.stringify(filters)}`);
        return this.dtesService.getConciliatedMatchesInPeriod(filters);
    }

    /**
     * GET /dtes/summary
     * Resumen de DTEs
     */
    @Get('summary')
    async getDtesSummary(
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
        @Query('providerId') providerId?: string,
        @Req() req?: Request
    ) {
        const organizationId = (req as any)?.organizationId;
        const filters: DteFilters = {
            organizationId,
            fromDate,
            toDate,
            providerId,
        };

        this.logger.log(`Fetching DTEs summary with filters: ${JSON.stringify(filters)}`);
        return this.dtesService.getDtesSummary(filters);
    }

    /**
     * GET /dtes/unpaid
     * DTEs pendientes de pago
     */
    @Get('unpaid')
    async getUnpaidDtes(@Query('limit') limit?: string, @Req() req?: Request) {
        const organizationId = (req as any)?.organizationId;
        const limitNum = limit ? parseInt(limit, 10) : 50;
        this.logger.log(`Fetching unpaid DTEs (limit: ${limitNum})`);
        return this.dtesService.getUnpaidDtes(organizationId, limitNum);
    }

    /**
     * GET /dtes/overdue
     * DTEs vencidos
     */
    @Get('overdue')
    async getOverdueDtes(@Req() req?: Request) {
        const organizationId = (req as any)?.organizationId;
        this.logger.log('Fetching overdue DTEs');
        return this.dtesService.getOverdueDtes(organizationId);
    }

    /**
     * POST /dtes/honorarios
     * Crear una boleta de honorarios manualmente
     */
    @Post('honorarios')
    async createBoletaHonorarios(
        @Body() body: { providerId: string; folio: number; amount: number; date?: string; notes?: string },
        @Req() req?: Request
    ) {
        const organizationId = (req as any)?.organizationId;
        this.logger.log(`Creating manual boleta honorarios for provider ${body.providerId}`);
        return this.dtesService.createBoletaHonorarios(organizationId, body);
    }

    /**
     * PATCH /dtes/:id/review
     * Marcar un DTE como revisado/pagado manualmente
     */
    @Patch(':id/review')
    async updateManualReview(
        @Param('id') id: string,
        @Body() body: { note?: string; status?: string },
        @Req() req?: Request
    ) {
        const organizationId = (req as any)?.organizationId;
        this.logger.log(`Updating DTE ${id} with manual review`);
        return this.dtesService.updateManualReview(id, organizationId, body);
    }

    /**
     * PATCH /dtes/:id/amount
     * Corrige el monto de un documento (especialmente útil para Boletas de Honorarios manuales)
     */
    @Patch(':id/amount')
    async updateDteAmount(
        @Param('id') id: string,
        @Body() body: { amount: number },
        @Req() req?: Request
    ) {
        const organizationId = (req as any)?.organizationId;
        this.logger.log(`Updating amount for DTE ${id} to ${body.amount}`);
        return this.dtesService.updateDteAmount(id, organizationId, body.amount);
    }
}
