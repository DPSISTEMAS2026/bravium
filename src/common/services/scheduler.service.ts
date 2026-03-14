
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LibreDteService } from '../../modules/ingestion/services/libredte.service';
import { ConciliacionService } from '../../modules/conciliacion/conciliacion.service';
import { GoogleDriveService } from '../../modules/ingestion/services/google-drive.service';
import { DriveIngestService } from '../../modules/ingestion/services/drive-ingest.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SchedulerService {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private readonly libreDteService: LibreDteService,
        private readonly conciliacionService: ConciliacionService,
        private readonly googleDriveService: GoogleDriveService,
        private readonly driveIngestService: DriveIngestService,
        private readonly configService: ConfigService
    ) { }

    /**
     * Sincronización Diaria y Conciliación Automática
     * Se ejecuta todos los días a las 04:00 AM
     */
    @Cron(CronExpression.EVERY_DAY_AT_4AM)
    async handleDailySyncAndMatch() {
        this.logger.log('⏰ DAILY CRON: Starting full automation cycle...');

        try {
            // 0. Extraer archivos de Banca desde Google Drive
            const folderId = this.configService.get<string>('GOOGLE_DRIVE_FOLDER_ID');
            if (folderId) {
                this.logger.log(`🏦 Pulling bank statements from Google Drive: ${folderId}`);
                const driveFiles = await this.googleDriveService.downloadFolderContents(folderId);

                let processed = 0, skipped = 0;
                for (const file of driveFiles) {
                    const alreadyDone = await this.driveIngestService.isFileAlreadyProcessed(file.name);
                    if (alreadyDone) {
                        skipped++;
                        continue;
                    }
                    this.logger.log(`🧬 Ingesting NEW file: ${file.name}`);
                    const bankInfo = this.detectBankFromFilename(file.name);
                    await this.driveIngestService.processDriveFile({
                        bank: bankInfo.bank,
                        account: bankInfo.account,
                        fileContentBase64: file.contentBase64,
                        metadata: { filename: file.name, source: 'GOOGLE_DRIVE_CRON', mimeType: file.mimeType }
                    });
                    processed++;
                }
                this.logger.log(`📊 Drive sync: ${processed} nuevos, ${skipped} ya existentes de ${driveFiles.length} total`);
            } else {
                this.logger.warn('GOOGLE_DRIVE_FOLDER_ID no configurada en env.');
            }

            // 1. Definir rango de fechas (Sincronizar últimos 30 días por seguridad)
            const today = new Date();
            const lastMonth = new Date(today);
            lastMonth.setDate(lastMonth.getDate() - 30);

            const startDate = lastMonth.toISOString().split('T')[0];
            const endDate = today.toISOString().split('T')[0];

            this.logger.log(`📥 Syncing NEW DTEs from LibreDTE (${startDate} to ${endDate})...`);

            // 2. Extraer Facturas (DTEs)
            const dteResult = await this.libreDteService.fetchReceivedDTEs(startDate, endDate);
            this.logger.log(`✅ DTE Sync Result: ${JSON.stringify(dteResult)}`);

            // 3. Ejecutar Auto-Match (Cruce con Cartolas Bancarias)
            this.logger.log('🤖 Running Auto-Match algorithm...');
            const matchResult = await this.conciliacionService.runReconciliationCycle(startDate, endDate);

            this.logger.log(`✅ Auto-Match Completed. Processed: ${matchResult.processed}, New Matches: ${matchResult.matches}`);
            this.logger.log('✨ Daily cycle finished successfully.');

        } catch (error) {
            this.logger.error('❌ Daily Cron Failed:', error.stack);
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
        return { bank: 'Drive Import', account: 'AUTO' };
    }
}
