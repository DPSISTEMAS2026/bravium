import { Controller, Post, Body, Logger, Get, Param, Query, Res, Req, NotFoundException, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LibreDteService } from '../services/libredte.service';
import { DriveIngestService, DriveIngestDto } from '../services/drive-ingest.service';
import { DtesService } from '../../contabilidad/dtes.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Response, Request } from 'express';

interface SyncDteDto {
    fromDate: string;
    toDate: string;
    dtes?: any[];
    organizationId: string;
}

import { GoogleDriveService } from '../services/google-drive.service';

@Controller('ingestion')
export class IngestionController {
    private readonly logger = new Logger(IngestionController.name);

    constructor(
        private readonly libreDteService: LibreDteService,
        private readonly driveIngestService: DriveIngestService,
        private readonly dtesService: DtesService,
        private readonly googleDriveService: GoogleDriveService,
        private readonly prisma: PrismaService,
    ) { }

    /**
     * GET /ingestion/sync/status
     * Returns latest sync logs for the requesting organization (or all if no auth).
     */
    @Get('sync/status')
    async getSyncStatus(@Req() req: Request, @Query('limit') limit?: string) {
        const organizationId = (req as any).user?.organizationId;
        const take = Math.min(parseInt(limit || '10', 10), 50);

        const where: any = {};
        if (organizationId) where.organizationId = organizationId;

        const logs = await this.prisma.syncLog.findMany({
            where,
            orderBy: { startedAt: 'desc' },
            take,
        });

        // Also find the latest successful DTE sync
        const lastSuccess = await this.prisma.syncLog.findFirst({
            where: {
                ...where,
                type: { in: ['DTE_SYNC', 'STARTUP_SYNC'] },
                status: 'SUCCESS',
            },
            orderBy: { finishedAt: 'desc' },
        });

        return {
            lastSuccessfulSync: lastSuccess ? {
                type: lastSuccess.type,
                finishedAt: lastSuccess.finishedAt,
                created: lastSuccess.created,
                skipped: lastSuccess.skipped,
                totalFound: lastSuccess.totalFound,
                durationMs: lastSuccess.durationMs,
                message: lastSuccess.message,
            } : null,
            recentLogs: logs.map(l => ({
                id: l.id,
                type: l.type,
                status: l.status,
                totalFound: l.totalFound,
                created: l.created,
                skipped: l.skipped,
                errors: l.errors,
                message: l.message,
                durationMs: l.durationMs,
                startedAt: l.startedAt,
                finishedAt: l.finishedAt,
            })),
        };
    }


    @Post('libredte/sync')
    async syncDtes(@Body() body: SyncDteDto, @Req() req: Request) {
        const organizationId = body.organizationId || (req as any).user?.organizationId;
        if (!organizationId) {
            throw new BadRequestException('organizationId is required for syncing DTEs');
        }

        const { fromDate, toDate, dtes } = body;

        // Prioridad: Inyección manual
        if (dtes && Array.isArray(dtes) && dtes.length > 0) {
            this.logger.log(`Manual injection trigger: ${dtes.length} DTEs provided`);
            return this.libreDteService.ingestDtes(dtes, organizationId);
        }

        if (!fromDate || !toDate) {
            return {
                status: 'error',
                message: 'Missing fromDate or toDate'
            };
        }

        this.logger.log(`Manual trigger: Syncing DTEs from ${fromDate} to ${toDate} for org: ${organizationId}`);

        try {
            const result = await this.libreDteService.fetchReceivedDTEs(fromDate, toDate, organizationId);
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
        try {
            const result = await this.driveIngestService.processDriveFile(body);
            return result;
        } catch (error) {
            this.logger.error('Drive Ingest Failed', error);
            return { status: 'error', message: error.message };
        }
    }

    @Get('drive/pull')
    async pullFromDrive(@Query('filename') filenameFilter?: string) {
        this.logger.log(`Manual Trigger: Pulling from Google Drive...${filenameFilter ? ` (filter: ${filenameFilter})` : ' (all files)'}`);
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        if (!folderId) {
            return { status: 'error', message: 'GOOGLE_DRIVE_FOLDER_ID not configured' };
        }

        try {
            let driveFiles = await this.googleDriveService.downloadFolderContents(folderId);

            if (filenameFilter) {
                const filter = filenameFilter.toUpperCase();
                driveFiles = driveFiles.filter(f => f.name.toUpperCase().includes(filter));
                this.logger.log(`Filtered to ${driveFiles.length} files matching "${filenameFilter}"`);
            }

            const results = [];
            let newFiles = 0, skippedFiles = 0;

            for (const file of driveFiles) {
                this.logger.log(`Processing file: ${file.name}`);
                const bankInfo = this.detectBankFromFilename(file.name);
                const res = await this.driveIngestService.processDriveFile({
                    bank: bankInfo.bank,
                    account: bankInfo.account,
                    fileContentBase64: file.contentBase64,
                    metadata: { filename: file.name, source: 'MANUAL_PULL', mimeType: file.mimeType }
                });
                if (res.status === 'skipped') skippedFiles++;
                else newFiles++;
                results.push({ file: file.name, ...res });
            }

            return {
                status: 'success',
                message: `Procesados ${newFiles} archivos nuevos, ${skippedFiles} ya existentes de ${driveFiles.length} total`,
                details: results
            };
        } catch (e) {
            this.logger.error('Error en pull manual', e);
            return { status: 'error', message: e.message };
        }
    }

    private detectBankFromFilename(filename: string): { bank: string; account: string } {
        const upper = filename.toUpperCase();
        if (upper.includes('ESTADOCUENTATC') || upper.includes('ESTADO DE CUENTA TC')) {
            const match = filename.match(/(\d{4})/);
            return { bank: 'Santander TC', account: match ? `XXXX-${match[1]}` : 'TC' };
        }
        if (upper.includes('SANTANDER')) return { bank: 'Santander', account: 'CTA-CTE' };
        if (upper.includes('SCOTIABANK')) return { bank: 'Scotiabank', account: 'CTA-CTE' };
        if (upper.includes('ITAU') || upper.includes('ITAÚ')) return { bank: 'Itaú', account: 'CTA-CTE' };
        return { bank: 'Drive Manual', account: 'AUTO' };
    }

    @Post('cartolas/upload')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
    async uploadCartola(
        @UploadedFile() file: any,
        @Body('bank') bank?: string,
        @Body('account') account?: string,
        @Body('bankAccountId') bankAccountId?: string,
        @Body('replace') replace?: string,
        @Req() req?: Request,
    ) {
        if (!file) throw new BadRequestException('Se requiere un archivo (PDF, Excel o CSV)');

        const ext = file.originalname.toLowerCase();
        const allowed = ['.pdf', '.xlsx', '.xls', '.csv'];
        if (!allowed.some(e => ext.endsWith(e))) {
            throw new BadRequestException(`Formato no soportado. Usa: ${allowed.join(', ')}`);
        }

        const forceReplace = replace === 'true' || replace === '1';
        if (forceReplace) this.logger.log(`Upload con reemplazo forzado: ${file.originalname}`);

        this.logger.log(`Upload manual: ${file.originalname} (${(file.size / 1024).toFixed(1)} KB)`);

        const dto: DriveIngestDto = {
            organizationId: (req as any).user?.organizationId,
            bank: bank || 'Carga Manual',
            account: account || 'MANUAL',
            bankAccountId: bankAccountId,
            fileContentBase64: file.buffer.toString('base64'),
            metadata: {
                filename: file.originalname,
                source: 'MANUAL_UPLOAD',
                mimeType: file.mimetype,
                ingestedBy: 'user',
                forceReplace,
            },
        };

        return this.driveIngestService.processDriveFile(dto);
    }

    @Get('ping')
    ping() {
        return { message: 'pong', timestamp: new Date().toISOString() };
    }

    @Post('manual/dtes-csv')
    async ingestManualDtes(@Body() body: { csvContent: string }) {
        if (!body.csvContent) return { status: 'error', message: 'No content' };
        return this.driveIngestService.processManualDteCsv(body.csvContent);
    }

    @Get('libredte/pdf/:id')
    async getDtePdf(@Param('id') id: string, @Res() res: Response, @Req() req: Request) {
        this.logger.log(`Requesting PDF for DTE ID: ${id}`);

        const dte = await this.dtesService.getDteById(id);
        if (!dte) {
            throw new NotFoundException('DTE no encontrado');
        }

        try {
            const organizationId = dte.provider?.organizationId || (req as any).user?.organizationId;
            if (!organizationId) {
                throw new BadRequestException('Organization could not be determined for PDF request.');
            }

            const pdfBuffer = await this.libreDteService.getDtePdf(
                dte.rutIssuer,
                dte.type,
                dte.folio,
                organizationId
            );

            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=DTE_${dte.type}_${dte.folio}.pdf`,
                'Content-Length': pdfBuffer.length,
            });

            res.end(pdfBuffer);
        } catch (error) {
            this.logger.error(`Error generating PDF for DTE ${id}`, error);
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    }
}
