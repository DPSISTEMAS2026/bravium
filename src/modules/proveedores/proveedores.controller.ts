import { Controller, Get, Patch, Param, Query, Body, Logger, Res, HttpStatus, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { ProveedoresService } from './proveedores.service';
import { PagoMasivoExportService } from './services/pago-masivo-export.service';

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
    ) {
        const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
        const limitNum = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 20;
        this.logger.log(`Fetching providers page ${pageNum}${search ? ` search: ${search}` : ''}`);
        return this.proveedoresService.getAllProviders(search, pageNum, limitNum);
    }

    /**
     * GET /proveedores/top
     * Top proveedores por deuda
     */
    @Get('top')
    async getTopProviders(@Query('limit') limit?: string) {
        const limitNum = limit ? parseInt(limit, 10) : 10;
        this.logger.log(`Fetching top ${limitNum} providers by debt`);
        return this.proveedoresService.getTopProvidersByDebt(limitNum);
    }

    /**
     * GET /proveedores/export/pago-masivo
     * Exportar Excel con datos para pago masivo Santander
     */
    @Get('export/pago-masivo')
    async exportPagoMasivo(@Res() res: Response) {
        this.logger.log('Exporting pago masivo');
        try {
            const buffer = await this.pagoMasivoService.exportPagoMasivo();
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
    async getPagoMasivoSummary() {
        return this.pagoMasivoService.getSummary();
    }

    /**
     * GET /proveedores/:id
     * Detalle de un proveedor específico
     */
    @Get(':id')
    async getProviderDetail(@Param('id') id: string) {
        this.logger.log(`Fetching provider detail for ID: ${id}`);
        return this.proveedoresService.getProviderDetail(id);
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
