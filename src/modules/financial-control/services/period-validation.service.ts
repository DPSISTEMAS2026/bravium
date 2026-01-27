import { Injectable, BadRequestException } from '@nestjs/common';
import { FinancialAlertService } from './financial-alert.service';
import { AlertSeverity, AlertStatus } from '@prisma/client';

@Injectable()
export class PeriodValidationService {
    constructor(private alertService: FinancialAlertService) { }

    /**
     * Validates if a period is ready to be closed.
     * Blocks closure if CRITICAL alerts are unresolved.
     */
    async validatePeriodClosure(periodId: string) {
        // 1. Run live check to catch new issues
        await this.alertService.runAllChecks();

        // 2. Fetch active alerts linked to this period (or global relevant ones)
        // Simplifying: Fetch all CRITICAL open alerts.
        // Ideally, we filter by alerts that impact this period's accuracy.
        const alerts = await this.alertService.getPendingAlerts();

        const criticalIssues = alerts.filter(a =>
            a.severity === AlertSeverity.CRITICAL &&
            a.status !== AlertStatus.RESOLVED &&
            a.status !== AlertStatus.IGNORED
        );

        if (criticalIssues.length > 0) {
            throw new BadRequestException({
                message: 'Cannot close period. Critical unresolved alerts exist.',
                issues: criticalIssues.map(i => `${i.code}: ${i.message}`)
            });
        }

        return { ready: true };
    }
}
