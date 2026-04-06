import { Controller, Get, Patch, Param, Query, Body, Logger, Res, Req, HttpStatus, NotFoundException, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
import { ProveedoresService } from './proveedores.service';
import { PagoMasivoExportService } from './services/pago-masivo-export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrganizationGuard } from '../../common/guards/organization.guard';

@UseGuards(JwtAuthGuard, RolesGuard, OrganizationGuard)
@Controller('proveedores')
export class ProveedoresController {
    private readonly logger = new Logger(ProveedoresController.name);

    constructor(
        private readonly proveedoresService: ProveedoresService,
        private readonly pagoMasivoService: PagoMasivoExportService,
    ) { }

    /**
     * GET /proveedores
     * Lista todos los proveedores con métricas de deuda
     */
    @Get()
    async getAllProviders(
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('year') year?: string,
        @Query('month') month?: string,
        @Query('status') status?: string,
        @Req() req?: Request,
    ) {
        const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
        const limitNum = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 20;
        const organizationId = (req as any).user?.organizationId;
        this.logger.log(`Fetching providers page ${pageNum}${search ? ` search: ${search}` : ''} year: ${year} month: ${month} status: ${status}`);
        return this.proveedoresService.getAllProviders(search, pageNum, limitNum, organizationId, year, status, month);
    }

    /**
     * GET /proveedores/top
     * Top proveedores por deuda
     */
    @Get('top')
    async getTopProviders(@Query('limit') limit?: string, @Req() req?: Request) {
        const limitNum = limit ? parseInt(limit, 10) : 10;
        const organizationId = (req as any).user?.organizationId;
        this.logger.log(`Fetching top ${limitNum} providers by debt`);
        return this.proveedoresService.getTopProvidersByDebt(limitNum, organizationId);
    }

    /**
     * GET /proveedores/export/pago-masivo
     * Exportar Excel con datos para pago masivo Santander
     */
    @Get('export/pago-masivo')
    async exportPagoMasivo(@Res() res: Response, @Req() req: Request) {
        this.logger.log('Exporting pago masivo');
        try {
            const organizationId = (req as any).user?.organizationId;
            const buffer = await this.pagoMasivoService.exportPagoMasivo(organizationId);
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `pago_masivo_${timestamp}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', buffer.byteLength);
            res.status(HttpStatus.OK).send(buffer);
        } catch (error) {
            this.logger.error(`Error exporting pago masivo: ${error.message}`);
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: error.message });
        }
    }

    /**
     * GET /proveedores/export/pago-masivo/summary
     * Resumen de pago masivo
     */
    @Get('export/pago-masivo/summary')
    async getPagoMasivoSummary(@Req() req: Request) {
        const organizationId = (req as any).user?.organizationId;
        return this.pagoMasivoService.getSummary(organizationId);
    }

    /**
     * GET /proveedores/:id
     * Detalle de un proveedor específico
     */
    @Get(':id')
    async getProviderDetail(@Param('id') id: string, @Req() req?: Request) {
        this.logger.log(`Fetching provider detail for ID: ${id}`);
        // Consider passing organizationId if detailed scoping is needed, though id is usually specific.
        return this.proveedoresService.getProviderDetail(id, (req as any).user?.organizationId);
    }

    /**
     * PATCH /proveedores/:id
     * Actualizar datos del proveedor (cuenta bancaria, etc.)
     */
    @Patch(':id')
    async updateProvider(
        @Param('id') id: string,
        @Body() body: {
            transferBankName?: string;
            transferAccountNumber?: string;
            transferAccountType?: string;
            transferRut?: string;
            transferEmail?: string;
            contactName?: string;
            logisticsContact?: string;
            creditLine?: number;
            comments?: string;
            deliveryTime?: string;
            differential?: string;
            boardReview?: boolean;
            favorableBalance?: number;
        },
    ) {
        this.logger.log(`Updating provider ${id}: ${JSON.stringify(body)}`);
        try {
            return await this.proveedoresService.updateProvider(id, body);
        } catch (err) {
            throw new NotFoundException('Proveedor no encontrado');
        }
    }
}
