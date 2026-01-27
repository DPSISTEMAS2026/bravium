import { Module } from '@nestjs/common';
import { ExcelLegacyService } from './historical/excel-legacy.service';
import { AutomatedIngestController } from './automated/automated-ingest.controller';
import { IngestionController } from './controllers/ingestion.controller';
import { LibreDteService } from './services/libredte.service';
import { DriveIngestService } from './services/drive-ingest.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ContabilidadModule } from '../../modules/contabilidad/contabilidad.module';

@Module({
    imports: [PrismaModule, ContabilidadModule],
    controllers: [AutomatedIngestController, IngestionController],
    providers: [ExcelLegacyService, LibreDteService, DriveIngestService],
    exports: [ExcelLegacyService, LibreDteService, DriveIngestService],
})
export class IngestionModule { }
