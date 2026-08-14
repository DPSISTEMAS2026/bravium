import { Module } from '@nestjs/common';
import { ExcelLegacyService } from './historical/excel-legacy.service';
import { IngestionController } from './controllers/ingestion.controller';
import { LibreDteService } from './services/libredte.service';
import { DriveIngestService } from './services/drive-ingest.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ContabilidadModule } from '../../modules/contabilidad/contabilidad.module';
import { BancosModule } from '../bancos/bancos.module';
import { OpenAiService } from './services/openai.service';
import { GoogleDriveService } from './services/google-drive.service';
import { PaymentRecordsModule } from '../payment-records/payment-records.module';

@Module({
    imports: [PrismaModule, ContabilidadModule, BancosModule, PaymentRecordsModule],
    controllers: [IngestionController],
    providers: [ExcelLegacyService, LibreDteService, DriveIngestService, OpenAiService, GoogleDriveService],
    exports: [ExcelLegacyService, LibreDteService, DriveIngestService, OpenAiService, GoogleDriveService],
})
export class IngestionModule { }
