import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Logger } from '@nestjs/common';
import { PaymentRecordsService, CreatePaymentRecordDto, ImportExcelRowDto } from './payment-records.service';

@Controller('payment-records')
export class PaymentRecordsController {
    private readonly logger = new Logger(PaymentRecordsController.name);

    constructor(private readonly service: PaymentRecordsService) {}

    @Get()
    async list(
        @Query('mes') mes?: string,
        @Query('empresa') empresa?: string,
        @Query('vinculado') vinculado?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.service.list({
            mes,
            empresa,
            vinculado,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
        });
    }

    @Get('summary')
    async summary() {
        return this.service.getSummary();
    }

    @Post()
    async create(@Body() dto: CreatePaymentRecordDto) {
        this.logger.log(`Creating payment record: ${dto.empresa} - $${dto.monto}`);
        return this.service.create(dto);
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
