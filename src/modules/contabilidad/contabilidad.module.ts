import { Module } from '@nestjs/common';
import { AccountingPeriodService } from './services/accounting-period.service';
import { FinancialConsolidationService } from './services/financial-consolidation.service';
import { LedgerService } from './services/ledger.service';
import { HistoricalImportService } from './services/historical-import.service';
import { AccountingExportService } from './export/accounting-export.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { NuboxExportStrategy } from './export/strategies/nubox-export.strategy';
import { DtesController } from './dtes.controller';
import { DtesService } from './dtes.service';

@Module({
    imports: [PrismaModule],
    controllers: [DtesController],
    providers: [
        AccountingPeriodService,
        FinancialConsolidationService,
        LedgerService,
        HistoricalImportService,
        AccountingExportService,
        NuboxExportStrategy,
        DtesService,
    ],
    exports: [
        AccountingPeriodService,
        FinancialConsolidationService,
        LedgerService,
        AccountingExportService,
        DtesService,
    ],
})
export class ContabilidadModule { }
