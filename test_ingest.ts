import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { DriveIngestService } from './src/modules/ingestion/services/drive-ingest.service';
import * as fs from 'fs';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const ingestService = app.get(DriveIngestService);

    const filePath = "d:\\BRAVIUM-PRODUCCION\\scripts\\Ultimos movimientos_nac16_04_2026 (1).xlsm";
    const fileContentBase64 = fs.readFileSync(filePath).toString('base64');

    try {
        const res = await ingestService.processDriveFile({
            organizationId: '715545b8-4522-4bb1-be81-3047546c0e8c',
            bank: 'Santander TC',
            account: 'MANUAL',
            fileContentBase64,
            metadata: {
                filename: 'Ultimos movimientos_nac16_04_2026 (1).xlsm',
                source: 'MANUAL_UPLOAD',
                forceReplace: false
            }
        });
        console.log("=== FINAL RESULT ===");
        console.log(JSON.stringify(res, null, 2));
    } catch(e) {
        console.error(e);
    }

    await app.close();
}
run();
