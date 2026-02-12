
import { Controller, Post, Get, Body, Logger, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ConciliacionService } from './conciliacion.service';
import { ConciliacionDashboardService } from './conciliacion-dashboard.service';
import { ExportService } from './services/export.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { ExportType } from './dto/export-filters.dto';

interface AutoMatchDto {
    fromDate?: string;
    toDate?: string;
}

@Controller('conciliacion')
export class ConciliacionController {
    private readonly logger = new Logger(ConciliacionController.name);

    constructor(
        private readonly conciliacionService: ConciliacionService,
        private readonly dashboardService: ConciliacionDashboardService,
        private readonly exportService: ExportService
    ) { }

    /**
     * Dashboard con filtros avanzados
     * Soporta filtros por año, mes, proveedor, estado, monto, etc.
     */
    @Get('dashboard')
    async getDashboard(@Query() filters: DashboardFiltersDto) {
        this.logger.log(`Dashboard requested with filters: ${JSON.stringify(filters)}`);
        return this.dashboardService.getDashboard(filters);
    }

    /**
     * Exportar datos a Excel
     * Tipos: transactions, dtes, matches, all
     */
    @Get('export/excel')
    async exportToExcel(
        @Query() filters: DashboardFiltersDto,
        @Query('type') type: ExportType = ExportType.ALL,
        @Res() res: Response
    ) {
        try {
            this.logger.log(`Export to Excel requested: type=${type}, filters=${JSON.stringify(filters)}`);

            const buffer = await this.exportService.exportToExcel(type, filters);

            // Generar nombre de archivo
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `conciliacion_${type}_${timestamp}.xlsx`;

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', buffer.byteLength);

            res.status(HttpStatus.OK).send(buffer);
        } catch (error) {
            this.logger.error(`Error exporting to Excel: ${error.message}`, error.stack);
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                status: 'error',
                message: 'Error al exportar a Excel',
                error: error.message
            });
        }
    }

    /**
     * Obtener lista de proveedores (para filtro de autocomplete)
     */
    @Get('providers')
    async getProviders(@Query('search') search?: string) {
        // Este endpoint puede ser implementado para el autocomplete del frontend
        // Por ahora retornamos un placeholder
        return {
            providers: []
        };
    }

    @Get('files')
    async getFiles() {
        return this.conciliacionService.getIngestedFiles();
    }

    @Get('overview')
    async getOverview(@Query('filename') filename?: string) {
        return this.conciliacionService.getOverview(100, filename);
    }

    @Post('run-auto-match')
    async runAutoMatch(@Body() body: AutoMatchDto) {
        this.logger.log(`Manual trigger: Run Auto Match`);
        const result = await this.conciliacionService.runReconciliationCycle(body.fromDate, body.toDate);

        return {
            status: 'success',
            data: result
        };
    }
}
