
import { Controller, Post, Body, Logger, Get } from '@nestjs/common';
import { LibreDteService } from '../services/libredte.service';
import { DriveIngestService, DriveIngestDto } from '../services/drive-ingest.service';

interface SyncDteDto {
    fromDate: string;
    toDate: string;
}

@Controller('ingestion')
export class IngestionController {
    private readonly logger = new Logger(IngestionController.name);

    constructor(
        private readonly libreDteService: LibreDteService,
        private readonly driveIngestService: DriveIngestService
    ) { }

    @Post('libredte/sync')
    async syncDtes(@Body() body: SyncDteDto) {
        const { fromDate, toDate } = body;

        if (!fromDate || !toDate) {
            return {
                status: 'error',
                message: 'Missing fromDate or toDate'
            };
        }

        this.logger.log(`Manual trigger: Syncing DTEs from ${fromDate} to ${toDate}`);

        try {
            const result = await this.libreDteService.fetchReceivedDTEs(fromDate, toDate);
            return {
                status: 'success',
                data: result
            };
        } catch (error) {
            this.logger.error('Sync failed', error);
            return {
                status: 'error',
                message: error.message,
                stack: error.stack // Optional: for debugging
            };
        }
    }

    @Post('cartolas/drive')
    async ingestDriveCartola(@Body() body: DriveIngestDto) {
        if (!body.fileUrl && !body.fileContentBase64 && !body.jsonRows) {
            return { status: 'error', message: 'Missing file content, URL, or JSON rows' };
        }

        try {
            const result = await this.driveIngestService.processDriveFile(body);
            return { status: 'success', data: result };
        } catch (error) {
            this.logger.error('Drive Ingest Failed', error);
            return { status: 'error', message: error.message };
        }
    }
    @Get('ping')
    ping() {
        return { message: 'pong', timestamp: new Date().toISOString() };
    }
}
