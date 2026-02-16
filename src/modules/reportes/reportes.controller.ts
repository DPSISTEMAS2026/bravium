import { Controller, Get, Query, Logger } from '@nestjs/common';
import { ReportesService } from './reportes.service';

@Controller('reportes')
export class ReportesController {
    private readonly logger = new Logger(ReportesController.name);

    constructor(private readonly reportesService: ReportesService) { }

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
