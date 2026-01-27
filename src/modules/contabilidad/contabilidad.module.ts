import { Module } from '@nestjs/common';
import { AccountingPeriodService } from './services/accounting-period.service';
import { FinancialConsolidationService } from './services/financial-consolidation.service';
import { LedgerService } from './services/ledger.service';
import { HistoricalImportService } from './services/historical-import.service';
import { AccountingExportService } from './export/accounting-export.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [],
    providers: [
        AccountingPeriodService,
        FinancialConsolidationService,
        LedgerService,
        HistoricalImportService,
        AccountingExportService
    ],
    exports: [
        AccountingPeriodService,
        FinancialConsolidationService,
        LedgerService,
        HistoricalImportService,
        AccountingExportService
    ],
})
export class ContabilidadModule { }
