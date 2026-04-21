import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { DriveIngestService } from './src/modules/ingestion/services/drive-ingest.service';
import * as fs from 'fs';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const ingest = app.get(DriveIngestService);

    const filePath = "d:\\BRAVIUM-PRODUCCION\\scripts\\Ultimos movimientos_nac16_04_2026 (1).xlsm";
    const fileBase64 = fs.readFileSync(filePath).toString('base64');

    console.log("Ingesting file...");
    const res = await ingest.processDriveFile({
        bankAccountId: "acc-itau-0215703887",
        fileContentBase64: fileBase64,
        metadata: {
            filename: "Ultimos movimientos_nac16_04_2026 (1).xlsm",
            invertAmountSign: true
        }
    });

    console.log(res);

    await app.close();
}
run();
