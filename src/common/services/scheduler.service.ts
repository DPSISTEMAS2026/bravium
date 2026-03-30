
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LibreDteService } from '../../modules/ingestion/services/libredte.service';
import { ConciliacionService } from '../../modules/conciliacion/conciliacion.service';
import { GoogleDriveService } from '../../modules/ingestion/services/google-drive.service';
import { DriveIngestService } from '../../modules/ingestion/services/drive-ingest.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private readonly libreDteService: LibreDteService,
        private readonly conciliacionService: ConciliacionService,
        private readonly googleDriveService: GoogleDriveService,
        private readonly driveIngestService: DriveIngestService,
        private readonly prisma: PrismaService,
    ) { }

    /**
     * Al arrancar el servidor: Sincronizar DTEs automáticamente para todos los tenants activos.
     */
    async onModuleInit() {
        // Pequeño delay para que NestJS termine de inicializar todo
        setTimeout(() => this.runStartupSync(), 5000);
    }

    private async runStartupSync() {
        this.logger.log('🚀 STARTUP SYNC: Checking if full automation cycle is needed for active tenants...');

        try {
            const orgs = await this.prisma.organization.findMany({
                where: { isActive: true }
            });

            for (const org of orgs) {
                // Check if we already synced today
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);

                const existingSync = await this.prisma.syncLog.findFirst({
                    where: {
                        organizationId: org.id,
                        type: { in: ['DTE_SYNC', 'STARTUP_SYNC'] },
                        status: 'SUCCESS',
                        startedAt: { gte: todayStart }
                    }
                });

                if (existingSync) {
                    // Already synced DTEs today, but check if auto-match ran
                    const existingMatch = await this.prisma.syncLog.findFirst({
                        where: {
                            organizationId: org.id,
                            type: 'AUTO_MATCH',
                            status: 'SUCCESS',
                            startedAt: { gte: todayStart }
                        }
                    });

                    if (existingMatch) {
                        this.logger.log(`✅ [${org.slug || org.name}] Already synced + matched today, skipping.`);
                        continue;
                    }

                    this.logger.log(`⚡ [${org.slug || org.name}] DTEs synced today but Auto-Match pending — running full cycle...`);
                }

                this.logger.log(`📥 [${org.slug || org.name}] Running full automation cycle (Sync + Auto-Match)...`);
                try {
                    await this.processTenantAutomation(org);
                } catch (tenantError) {
                    this.logger.error(`❌ [${org.slug || org.name}] Startup automation failed:`, tenantError.message);
                }
            }

            this.logger.log('🏁 STARTUP SYNC completed (full cycle with Auto-Match).');
        } catch (error) {
            this.logger.error('❌ STARTUP SYNC failed:', error.message);
        }
    }

    /**
     * Sincronización Diaria y Conciliación Automática
     * Se ejecuta todos los días a las 04:00 AM hora de Chile
     */
    @Cron('0 4 * * *', {
        name: 'daily_sync_match',
        timeZone: 'America/Santiago'
    })
    async handleDailySyncAndMatch() {
        this.logger.log('⏰ DAILY CRON: Starting full automation cycle for all active tenants...');

        try {
            const orgs = await this.prisma.organization.findMany({
                where: { isActive: true }
            });

            this.logger.log(`Found ${orgs.length} active organizations to process.`);

            for (const org of orgs) {
                this.logger.log(`\n==================================================`);
                this.logger.log(`🚀 Processing tenant: ${org.name} (${org.slug})`);
                this.logger.log(`==================================================`);

                try {
                    await this.processTenantAutomation(org);
                } catch (tenantError) {
                    this.logger.error(`❌ Failed processing tenant ${org.name}:`, tenantError.stack);
                }
            }

            this.logger.log('\n✨ Daily cycle finished successfully for all tenants.');

        } catch (error) {
            this.logger.error('❌ Daily Cron Failed completely:', error.stack);
        }
    }

    /**
     * Sync DTEs for a single tenant and log the result.
     */
    private async runTenantDteSync(org: any, syncType: string = 'DTE_SYNC') {
        const startTime = Date.now();

        // Create sync log entry
        const syncLog = await this.prisma.syncLog.create({
            data: {
                organizationId: org.id,
                type: syncType,
                status: 'RUNNING',
                message: `Syncing DTEs for ${org.name}`,
            }
        });

        try {
            const result = await this.libreDteService.syncRecentlyReceivedDTEs(org.id);
            const durationMs = Date.now() - startTime;

            await this.prisma.syncLog.update({
                where: { id: syncLog.id },
                data: {
                    status: 'SUCCESS',
                    totalFound: result.total || 0,
                    created: result.created || 0,
                    skipped: result.skipped || 0,
                    errors: result.errors || 0,
                    durationMs,
                    finishedAt: new Date(),
                    message: `OK: ${result.created} nuevos, ${result.skipped} existentes, ${result.errors} errores de ${result.total} total`,
                }
            });

            this.logger.log(`✅ [${org.slug || org.name}] DTE sync: ${result.created} nuevos, ${result.skipped} existentes (${durationMs}ms)`);
            return result;
        } catch (error) {
            const durationMs = Date.now() - startTime;

            await this.prisma.syncLog.update({
                where: { id: syncLog.id },
                data: {
                    status: 'FAILED',
                    durationMs,
                    finishedAt: new Date(),
                    message: `Error: ${error.message}`,
                }
            });

            this.logger.error(`❌ [${org.slug || org.name}] DTE sync failed: ${error.message}`);
            throw error;
        }
    }

    private async processTenantAutomation(org: any) {
        // 0. Extraer archivos de Banca desde Google Drive
        const folderId = org.googleDriveFolderId;
        if (folderId) {
            this.logger.log(`🏦 [${org.slug}] Pulling bank statements from folder: ${folderId}`);
            try {
                const driveFiles = await this.googleDriveService.downloadFolderContents(folderId);

                let processed = 0, skipped = 0;
                for (const file of driveFiles) {
                    const alreadyDone = await this.driveIngestService.isFileAlreadyProcessed(file.name);
                    if (alreadyDone) {
                        skipped++;
                        continue;
                    }
                    this.logger.log(`🧬 [${org.slug}] Ingesting NEW file: ${file.name}`);
                    const bankInfo = this.detectBankFromFilename(file.name);
                    await this.driveIngestService.processDriveFile({
                        bank: bankInfo.bank,
                        account: bankInfo.account,
                        fileContentBase64: file.contentBase64,
                        organizationId: org.id,
                        metadata: { filename: file.name, source: 'GOOGLE_DRIVE_CRON', mimeType: file.mimeType }
                    });
                    processed++;
                }
                this.logger.log(`📊 [${org.slug}] Drive sync: ${processed} nuevos, ${skipped} ya existentes de ${driveFiles.length} total`);
            } catch (e) {
                this.logger.error(`[${org.slug}] Error processing Google Drive`, e);
            }
        } else {
            this.logger.log(`[${org.slug}] No Google Drive folder configured.`);
        }

        // 1. Sync DTEs via LibreDTE
        if (org.libreDteApiKey && org.libreDteRut) {
            try {
                await this.runTenantDteSync(org, 'DTE_SYNC');
            } catch (e) {
                // Already logged inside runTenantDteSync
            }
        } else {
            this.logger.log(`[${org.slug}] No LibreDTE credentials configured.`);
        }

        // 2. Ejecutar Auto-Match (+ log the result)
        const today = new Date();
        const sixtyDaysAgo = new Date(today);
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const startDate = sixtyDaysAgo.toISOString().split('T')[0];
        const endDate = today.toISOString().split('T')[0];

        this.logger.log(`🤖 [${org.slug}] Running Auto-Match algorithm...`);
        const matchStartTime = Date.now();
        const matchLog = await this.prisma.syncLog.create({
            data: {
                organizationId: org.id,
                type: 'AUTO_MATCH',
                status: 'RUNNING',
                dateRangeFrom: startDate,
                dateRangeTo: endDate,
                message: `Auto-Match for ${org.name}`,
            }
        });

        try {
            const matchResult = await this.conciliacionService.runReconciliationCycle(startDate, endDate, org.id);
            const durationMs = Date.now() - matchStartTime;
            const processed = matchResult.processed || 0;
            const matches = matchResult.matches || 0;

            await this.prisma.syncLog.update({
                where: { id: matchLog.id },
                data: {
                    status: 'SUCCESS',
                    totalFound: processed,
                    created: matches,
                    durationMs,
                    finishedAt: new Date(),
                    message: `OK: ${matches} matches de ${processed} transacciones procesadas (${durationMs}ms)`,
                }
            });

            this.logger.log(`✅ [${org.slug}] Auto-Match Completed. Processed: ${processed}, New Matches: ${matches}`);
        } catch (e) {
            const durationMs = Date.now() - matchStartTime;
            await this.prisma.syncLog.update({
                where: { id: matchLog.id },
                data: {
                    status: 'FAILED',
                    durationMs,
                    finishedAt: new Date(),
                    message: `Error: ${e.message}`,
                }
            });
            this.logger.error(`[${org.slug}] Error in auto-match algorithm`, e);
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
