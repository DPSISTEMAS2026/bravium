import { Module } from '@nestjs/common';
import { ConciliacionService } from './conciliacion.service';
import { ConciliacionDashboardService } from './conciliacion-dashboard.service';
import { ExactMatchStrategy } from './strategies/exact-match.strategy';
import { ApproximateMatchStrategy } from './strategies/approximate-match.strategy';
import { ConciliacionController } from './conciliacion.controller';

@Module({
    controllers: [ConciliacionController],
    providers: [
        ConciliacionService,
        ConciliacionDashboardService,
        ExactMatchStrategy,
        ApproximateMatchStrategy,
    ],
    exports: [ConciliacionService, ConciliacionDashboardService],
})
export class ConciliacionModule { }
