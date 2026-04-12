import { Module } from '@nestjs/common';
import { ExcelLegacyService } from './historical/excel-legacy.service';
import { AutomatedIngestController } from './automated/automated-ingest.controller';
import { IngestionController } from './controllers/ingestion.controller';
import { LibreDteService } from './services/libredte.service';
import { DriveIngestService } from './services/drive-ingest.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ContabilidadModule } from '../../modules/contabilidad/contabilidad.module';
import { BancosModule } from '../bancos/bancos.module';
import { OpenAiService } from './services/openai.service';
import { GoogleDriveService } from './services/google-drive.service';
import { FintocService } from './services/fintoc.service';

@Module({
    imports: [PrismaModule, ContabilidadModule, BancosModule],
    controllers: [AutomatedIngestController, IngestionController],
    providers: [ExcelLegacyService, LibreDteService, DriveIngestService, OpenAiService, GoogleDriveService, FintocService],
    exports: [ExcelLegacyService, LibreDteService, DriveIngestService, OpenAiService, GoogleDriveService, FintocService],
})
export class IngestionModule { }
