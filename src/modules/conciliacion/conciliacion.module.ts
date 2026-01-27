import { Module } from '@nestjs/common';
import { ConciliacionService } from './conciliacion.service';
import { ExactMatchStrategy } from './strategies/exact-match.strategy';
import { ApproximateMatchStrategy } from './strategies/approximate-match.strategy';
import { ConciliacionController } from './conciliacion.controller';

@Module({
    controllers: [ConciliacionController],
    providers: [
        ConciliacionService,
        ExactMatchStrategy,
        ApproximateMatchStrategy,
    ],
    exports: [ConciliacionService],
})
export class ConciliacionModule { }
