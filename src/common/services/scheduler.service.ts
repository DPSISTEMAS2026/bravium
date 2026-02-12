
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LibreDteService } from '../../modules/ingestion/services/libredte.service';
import { ConciliacionService } from '../../modules/conciliacion/conciliacion.service';

@Injectable()
export class SchedulerService {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private readonly libreDteService: LibreDteService,
        private readonly conciliacionService: ConciliacionService
    ) { }

    /**
     * Sincronización Diaria y Conciliación Automática
     * Se ejecuta todos los días a las 04:00 AM
     */
    @Cron(CronExpression.EVERY_DAY_AT_4AM)
    async handleDailySyncAndMatch() {
        this.logger.log('⏰ DAILY CRON: Starting full sync cycle...');

        try {
            // 1. Definir rango de fechas (Desde Enero 2025 hasta Hoy)
            const startDate = '2025-01-01';
            const today = new Date();
            const endDate = today.toISOString().split('T')[0]; // YYYY-MM-DD

            this.logger.log(`📥 Syncing DTEs from LibreDTE (${startDate} to ${endDate})...`);

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
}
