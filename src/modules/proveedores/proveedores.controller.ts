import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { ProveedoresService } from './proveedores.service';

@Controller('proveedores')
export class ProveedoresController {
    private readonly logger = new Logger(ProveedoresController.name);

    constructor(private readonly proveedoresService: ProveedoresService) { }

    /**
     * GET /proveedores
     * Lista todos los proveedores con métricas de deuda
     */
    @Get()
    async getAllProviders(@Query('search') search?: string) {
        this.logger.log(`Fetching all providers${search ? ` with search: ${search}` : ''}`);
        return this.proveedoresService.getAllProviders(search);
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
     * GET /proveedores/:id
     * Detalle de un proveedor específico
     */
    @Get(':id')
    async getProviderDetail(@Param('id') id: string) {
        this.logger.log(`Fetching provider detail for ID: ${id}`);
        return this.proveedoresService.getProviderDetail(id);
    }
}
