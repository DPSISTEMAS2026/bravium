
import { Controller, Post, Get, Patch, Delete, Body, Param, Logger, Query, Res, Req, HttpStatus, BadRequestException, NotFoundException, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
import { ConciliacionService } from './conciliacion.service';
import { ConciliacionDashboardService } from './conciliacion-dashboard.service';
import { MatchManagementService } from './services/match-management.service';
import { MatchSuggestionsService } from './services/match-suggestions.service';
import { ExportService } from './services/export.service';
import { MorningBriefingService } from './services/morning-briefing.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { ExportType } from './dto/export-filters.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrganizationGuard } from '../../common/guards/organization.guard';

interface AutoMatchDto {
    fromDate?: string;
    toDate?: string;
    syncFromSources?: boolean;
    organizationId?: string;
}

import { LibreDteService } from '../ingestion/services/libredte.service';

@UseGuards(JwtAuthGuard, RolesGuard, OrganizationGuard)
@Controller('conciliacion')
export class ConciliacionController {
    private readonly logger = new Logger(ConciliacionController.name);

    constructor(
        private readonly conciliacionService: ConciliacionService,
        private readonly dashboardService: ConciliacionDashboardService,
        private readonly matchManagement: MatchManagementService,
        private readonly matchSuggestions: MatchSuggestionsService,
        private readonly exportService: ExportService,
        private readonly libreDteService: LibreDteService,
        private readonly morningBriefing: MorningBriefingService,
    ) { }

    /**
     * GET /conciliacion/briefing
     * Resumen ejecutivo matutino: matches por revisar, pagos pendientes,
     * documentos sin factura, estado de sync.
     * Diseñado para que el frontend lo consuma al cargar el dashboard.
     */
    @Get('briefing')
    async getMorningBriefing(@Req() req: Request) {
        const organizationId = (req as any).user?.organizationId || (req as any).organizationId;
        if (!organizationId) {
            return { error: 'Organization context required' };
        }
        return this.morningBriefing.getBriefing(organizationId);
    }

    /**
     * Dashboard con filtros avanzados
     * Soporta filtros por año, mes, proveedor, estado, monto, etc.
     */
    @Get('dashboard')
    async getDashboard(@Query() filters: DashboardFiltersDto, @Req() req: Request) {
        filters.organizationId = filters.organizationId || (req as any).user?.organizationId;
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
        @Res() res: Response,
        @Req() req: Request
    ) {
        filters.organizationId = filters.organizationId || (req as any).user?.organizationId;
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
    async runAutoMatch(@Body() body: AutoMatchDto, @Req() req: Request) {
        const organizationId = body.organizationId || (req as any).user?.organizationId;
        
        if (!organizationId) {
            throw new BadRequestException('organizationId is required to run auto-match');
        }

        this.logger.log(`Trigger: Run Auto Match (Sync=${body.syncFromSources}, Org=${organizationId})`);

        if (body.syncFromSources) {
            try {
                await this.libreDteService.syncRecentlyReceivedDTEs(organizationId);
            } catch (err) {
                this.logger.warn(`Background sync failed: ${err.message}`);
            }
        }

        this.conciliacionService.runReconciliationCycle(body.fromDate, body.toDate, organizationId)
            .then(result => this.logger.log(`Async match finished: ${JSON.stringify(result)}`))
            .catch(err => this.logger.error(`Async match failed: ${err.message}`));

        return {
            status: 'accepted',
            message: 'Proceso de conciliación iniciado en segundo plano. Los resultados aparecerán progresivamente.',
            filters: { fromDate: body.fromDate, toDate: body.toDate }
        };
    }

    @Get('matches/historical-notes')
    async getHistoricalNotes(@Req() req: Request) {
        const organizationId = (req as any).user?.organizationId;
        return this.matchManagement.getHistoricalNotes(organizationId);
    }

    // ── Manual Match Management ──

    @Patch('matches/:id/status')
    async updateMatchStatus(
        @Param('id') id: string,
        @Body() body: { status: 'CONFIRMED' | 'REJECTED'; reason?: string },
        @Req() req: Request
    ) {
        const userId = (req as any).user?.id || (req as any).user?.sub || 'unknown';
        this.logger.log(`User ${userId} updating match ${id} status to ${body.status}`);
        return this.matchManagement.updateMatchStatus(id, body.status, userId, body.reason);
    }

    @Patch('matches/:id/notes')
    async updateMatchNotes(
        @Param('id') id: string,
        @Body() body: { notes: string },
        @Req() req: Request
    ) {
        const userId = (req as any).user?.id || (req as any).user?.sub || 'unknown';
        this.logger.log(`User ${userId} updating notes on match ${id}`);
        return this.matchManagement.updateMatchNotes(id, body.notes, userId);
    }

    @Post('matches/manual')
    async createManualMatch(
        @Body() body: { transactionId: string; dteId?: string; dteIds?: string[]; paymentId?: string; notes?: string },
        @Req() req: Request
    ) {
        const userId = (req as any).user?.id || (req as any).user?.sub || 'unknown';
        if (!body.transactionId || (!body.dteId && (!body.dteIds || body.dteIds.length === 0) && !body.paymentId)) {
            throw new BadRequestException('Se requiere transactionId y al menos dteId/dteIds o paymentId');
        }
        this.logger.log(`User ${userId} creating manual match: tx=${body.transactionId}, dteIds=${body.dteIds?.join(',') || body.dteId}`);
        try {
            return await this.matchManagement.createManualMatch(body, userId);
        } catch (err: any) {
            this.logger.error(`createManualMatch failed: ${err.message}`, err.stack);
            throw err;
        }
    }

    @Delete('matches/:id')
    async deleteMatch(
        @Param('id') id: string,
        @Req() req: Request
    ) {
        const userId = (req as any).user?.id || (req as any).user?.sub || 'unknown';
        this.logger.log(`User ${userId} deleting match ${id}`);
        return this.matchManagement.deleteMatch(id, userId);
    }

    @Get('matches/:id/history')
    async getMatchHistory(@Param('id') id: string) {
        return this.matchManagement.getMatchHistory(id);
    }

    // ── Suggestions (N:1 Sum Match) ──

    @Get('suggestions')
    async listSuggestions(@Req() req: Request, @Query('status') status?: string) {
        const organizationId = (req as any).user?.organizationId;
        return this.matchSuggestions.listSuggestions(status, organizationId);
    }

    @Get('suggestions/:id')
    async getSuggestion(@Param('id') id: string) {
        const suggestion = await this.matchSuggestions.getSuggestionById(id);
        if (!suggestion) throw new NotFoundException('Sugerencia no encontrada');
        return suggestion;
    }

    @Post('suggestions/:id/accept')
    async acceptSuggestion(
        @Param('id') id: string,
        @Body() body: { transactionIds?: string[]; dteId?: string },
        @Req() req: Request,
    ) {
        const userId = (req as any).user?.id || (req as any).user?.sub || 'unknown';
        return this.matchSuggestions.acceptSuggestion(id, userId, body);
    }

    @Post('suggestions/:id/reject')
    async rejectSuggestion(
        @Param('id') id: string,
        @Body() body: { reason?: string },
        @Req() req: Request,
    ) {
        const userId = (req as any).user?.id || (req as any).user?.sub || 'unknown';
        return this.matchSuggestions.rejectSuggestion(id, body.reason, userId);
    }
}
