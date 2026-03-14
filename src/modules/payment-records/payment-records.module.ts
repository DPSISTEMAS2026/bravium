import { Module } from '@nestjs/common';
import { PaymentRecordsService } from './payment-records.service';
import { PaymentRecordsController } from './payment-records.controller';

@Module({
    controllers: [PaymentRecordsController],
    providers: [PaymentRecordsService],
    exports: [PaymentRecordsService],
})
export class PaymentRecordsModule {}
