import { Controller, Get, Query, Logger } from '@nestjs/common';
import { DtesService, DteFilters } from './dtes.service';

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
        @Query('search') search?: string
    ) {
        const filters: DteFilters = {
            fromDate,
            toDate,
            providerId,
            paymentStatus,
            minAmount: minAmount ? parseInt(minAmount, 10) : undefined,
            maxAmount: maxAmount ? parseInt(maxAmount, 10) : undefined,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            search,
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
        @Query('limit') limit?: string
    ) {
        const filters: DteFilters = {
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
        @Query('providerId') providerId?: string
    ) {
        const filters: DteFilters = {
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
    async getUnpaidDtes(@Query('limit') limit?: string) {
        const limitNum = limit ? parseInt(limit, 10) : 50;
        this.logger.log(`Fetching unpaid DTEs (limit: ${limitNum})`);
        return this.dtesService.getUnpaidDtes(limitNum);
    }

    /**
     * GET /dtes/overdue
     * DTEs vencidos
     */
    @Get('overdue')
    async getOverdueDtes() {
        this.logger.log('Fetching overdue DTEs');
        return this.dtesService.getOverdueDtes();
    }
}
