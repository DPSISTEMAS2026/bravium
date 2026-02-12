
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LibreDteService } from '../../ingestion/services/libredte.service';
import { ConciliacionService } from '../conciliacion.service';
import { TransactionStatus } from '@prisma/client';

@Injectable()
export class AutoRecoveryService implements OnModuleInit {
    private readonly logger = new Logger(AutoRecoveryService.name);

    constructor(
        private prisma: PrismaService,
        private libreDte: LibreDteService,
        private conciliacion: ConciliacionService
    ) { }

    async onModuleInit() {
        // Ejecutar en background para no bloquear el inicio de la app
        setTimeout(() => this.runRecovery(), 5000);
    }

    private async runRecovery() {
        this.logger.log('🕵️ AUTO-RECOVERY: Checking data consistency...');

        try {
            // 1. Diagnóstico: ¿Tenemos matches basura?
            const matchesCount = await this.prisma.reconciliationMatch.count();
            const dtesCount = await this.prisma.dTE.count();

            // Condición: Hay matches pero NO hay DTEs (o muy pocos comparados con matches)
            // En el caso del usuario: 100 matches, 0 DTEs.
            if (matchesCount > 0 && dtesCount === 0) {
                this.logger.warn(`🚨 DATA INCONSISTENCY DETECTED: ${matchesCount} matches but ${dtesCount} DTEs.`);
                this.logger.warn('🚀 INITIATING AUTOMATIC REPAIR...');

                // 2. Limpieza
                this.logger.log('🧹 Cleaning invalid matches...');
                await this.prisma.reconciliationMatch.deleteMany({});
                await this.prisma.bankTransaction.updateMany({
                    data: { status: TransactionStatus.PENDING }
                });
                this.logger.log('✅ Matches cleaned.');

                // 3. Sincronización DTEs
                this.logger.log('📥 Syncing DTEs from LibreDTE (Jan-Feb 2026)...');
                await this.libreDte.fetchReceivedDTEs('2026-01-01', '2026-02-28');
                this.logger.log('✅ DTEs synced.');

                // 4. Auto-Match
                this.logger.log('🤖 Running Auto-Match...');
                await this.conciliacion.runReconciliationCycle('2026-01-01', '2026-02-28');
                this.logger.log('✅ Auto-Match completed.');

                this.logger.log('✨ SYSTEM REPAIRED SAFELY.');
            } else {
                this.logger.log(`✅ Data looks healthy: ${matchesCount} matches, ${dtesCount} DTEs.`);
            }

        } catch (error) {
            this.logger.error(`❌ Auto-recovery failed: ${error.message}`, error.stack);
        }
    }
}
