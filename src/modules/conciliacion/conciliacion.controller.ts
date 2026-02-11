
import { Controller, Post, Get, Body, Logger, Query } from '@nestjs/common';
import { ConciliacionService } from './conciliacion.service';
import { ConciliacionDashboardService } from './conciliacion-dashboard.service';

interface AutoMatchDto {
    fromDate?: string;
    toDate?: string;
}

@Controller('conciliacion')
export class ConciliacionController {
    private readonly logger = new Logger(ConciliacionController.name);

    constructor(
        private readonly conciliacionService: ConciliacionService,
        private readonly dashboardService: ConciliacionDashboardService
    ) { }

    @Get('dashboard')
    async getDashboard(
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string
    ) {
        this.logger.log(`Dashboard requested for period: ${fromDate || 'all'} to ${toDate || 'all'}`);
        return this.dashboardService.getDashboard(fromDate, toDate);
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

        // El servicio actualmente no acepta parámetros de fecha en runReconciliationCycle
        // pero el prompt pide "runAutoMatch(fromDate, toDate)".
        // Modificaré el servicio para aceptarlos o usaré la lógica existente que procesa pendientes.
        // Dado que el servicio ya tiene "pendingTransactions", usar eso es más seguro que fechas arbitrarias
        // para evitar reprocesar lo ya conciliado.
        // Sin embargo, pasaré las fechas si el servicio se refactoriza.

        // Por ahora, llamo al ciclo existente que es robusto.
        const result = await this.conciliacionService.runReconciliationCycle(body.fromDate, body.toDate);

        return {
            status: 'success',
            data: result
        };
    }
}
