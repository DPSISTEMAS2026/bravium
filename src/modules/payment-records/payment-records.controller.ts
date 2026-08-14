import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Logger, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { PaymentRecordsService, CreatePaymentRecordDto, ImportExcelRowDto } from './payment-records.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrganizationGuard } from '../../common/guards/organization.guard';

@UseGuards(JwtAuthGuard, RolesGuard, OrganizationGuard)
@Controller('payment-records')
export class PaymentRecordsController {
    private readonly logger = new Logger(PaymentRecordsController.name);

    constructor(private readonly service: PaymentRecordsService) {}

    private org(req?: Request): string {
        return (req as any)?.organizationId || (req as any)?.user?.organizationId;
    }

    @Get()
    async list(
        @Query('mes') mes?: string,
        @Query('empresa') empresa?: string,
        @Query('vinculado') vinculado?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('autorizacion') autorizacion?: string,
        @Req() req?: Request,
    ) {
        return this.service.list({
            mes,
            empresa,
            vinculado,
            autorizacion,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            organizationId: this.org(req),
        });
    }

    @Get('summary')
    async summary(@Req() req?: Request) {
        return this.service.getSummary(this.org(req));
    }

    @Get('week-queue')
    async weekQueue(@Req() req?: Request) {
        const organizationId = this.org(req);
        const data = await this.service.getWeekQueue(organizationId);
        return data;
    }

    @Get('folios')
    async folios(
        @Query('q') q?: string,
        @Query('providerId') providerId?: string,
        @Req() req?: Request,
    ) {
        return this.service.suggestFolios(this.org(req), q || '', providerId);
    }

    @Post()
    async create(@Body() dto: CreatePaymentRecordDto, @Req() req?: Request) {
        this.logger.log(`Creating payment record: ${dto.empresa} - $${dto.monto}`);
        const userId = (req as any)?.user?.id;
        return this.service.create(dto, userId, this.org(req));
    }

    @Post('declare')
    async declare(
        @Body() body: { dteIds?: string[]; fechaPago?: string; medioPago?: string; comentario?: string; detalle?: string },
        @Req() req?: Request,
    ) {
        const userId = (req as any)?.user?.id;
        const organizationId = this.org(req);
        if (!organizationId) throw new BadRequestException('Falta organización');
        const result = await this.service.declarePayments(body, userId, organizationId);
        return result;
    }

    @Post('confirm-cartola')
    async confirmCartola(@Req() req?: Request) {
        const organizationId = this.org(req);
        const result = await this.service.confirmDeclaredAgainstCartola(organizationId);
        return result;
    }

    @Post('import')
    async importExcel(@Body() body: { rows: ImportExcelRowDto[] }) {
        this.logger.log(`Importing ${body.rows.length} payment records from Excel`);
        return this.service.importFromExcel(body.rows);
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() dto: Partial<CreatePaymentRecordDto>) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        return this.service.delete(id);
    }
}
