import { Module } from '@nestjs/common';
import { FinancialAlertService } from './services/financial-alert.service';
import { FinancialExplanationService } from './services/financial-explanation.service';
import { PeriodValidationService } from './services/period-validation.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [],
    providers: [
        FinancialAlertService,
        FinancialExplanationService,
        PeriodValidationService
    ],
    exports: [
        FinancialAlertService,
        FinancialExplanationService,
        PeriodValidationService
    ],
})
export class FinancialControlModule { }
