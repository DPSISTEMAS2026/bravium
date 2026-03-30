import { Controller, Get, Post, Body, Query, Logger } from '@nestjs/common';
import { ReportesService } from './reportes.service';

@Controller('reportes')
export class ReportesController {
    private readonly logger = new Logger(ReportesController.name);

    constructor(private readonly reportesService: ReportesService) { }

    /**
     * POST /reportes/verificar-folios
     * Verifica el estado de match de una lista de folios en un mes dado
     */
    @Post('verificar-folios')
    async verificarFolios(
        @Body() body: { folios: number[]; year: number; month: number },
    ) {
        this.logger.log(
            `Verificando ${body.folios.length} folios para ${body.year}-${String(body.month).padStart(2, '0')}`,
        );
        return this.reportesService.verificarFolios(body.folios, body.year, body.month);
    }

    /**
     * GET /reportes/deuda-proveedores
     * Reporte de deuda por proveedor
     */
    @Get('deuda-proveedores')
    async getDeudaPorProveedor(
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string
    ) {
        this.logger.log(
            `Fetching debt by provider report (${fromDate} - ${toDate})`
        );
        return this.reportesService.getDeudaPorProveedor(fromDate, toDate);
    }

    /**
     * GET /reportes/flujo-caja
     * Reporte de flujo de caja
     */
    @Get('flujo-caja')
    async getFlujoCaja(
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string
    ) {
        this.logger.log(`Fetching cash flow report (${fromDate} - ${toDate})`);
        return this.reportesService.getFlujoCaja(fromDate, toDate);
    }

    /**
     * GET /reportes/facturas-vencidas
     * Reporte de facturas vencidas
     */
    @Get('facturas-vencidas')
    async getFacturasVencidas() {
        this.logger.log('Fetching overdue invoices report');
        return this.reportesService.getFacturasVencidas();
    }
}
