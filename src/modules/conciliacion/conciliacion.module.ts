import { Module } from '@nestjs/common';
import { ConciliacionService } from './conciliacion.service';
import { ConciliacionDashboardService } from './conciliacion-dashboard.service';
import { MatchManagementService } from './services/match-management.service';
import { MatchSuggestionsService } from './services/match-suggestions.service';
import { ExportService } from './services/export.service';
import { ExactMatchStrategy } from './strategies/exact-match.strategy';
import { AmountMatchStrategy } from './strategies/amount-match.strategy';
import { SumMatchStrategy } from './strategies/sum-match.strategy';
import { SplitPaymentMatchStrategy } from './strategies/split-payment-match.strategy';
import { ConciliacionController } from './conciliacion.controller';
import { AutoRecoveryService } from './services/auto-recovery.service';
import { MorningBriefingService } from './services/morning-briefing.service';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
    imports: [IngestionModule],
    controllers: [ConciliacionController],
    providers: [
        ConciliacionService,
        ConciliacionDashboardService,
        MatchManagementService,
        MatchSuggestionsService,
        ExportService,
        ExactMatchStrategy,
        AmountMatchStrategy,
        SumMatchStrategy,
        SplitPaymentMatchStrategy,
        AutoRecoveryService,
        MorningBriefingService,
    ],
    exports: [ConciliacionService, ConciliacionDashboardService, MatchManagementService, MatchSuggestionsService, ExportService, MorningBriefingService],
})
export class ConciliacionModule { }
