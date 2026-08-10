import { Module } from '@nestjs/common';
import { PaymentRecordsService } from './payment-records.service';
import { PaymentRecordsController } from './payment-records.controller';
import { ExcelLiveSyncService } from './excel-live-sync.service';

@Module({
    controllers: [PaymentRecordsController],
    providers: [PaymentRecordsService, ExcelLiveSyncService],
    exports: [PaymentRecordsService, ExcelLiveSyncService],
})
export class PaymentRecordsModule {}
