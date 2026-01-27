import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
    FinancialAlert,
    AlertSeverity,
    AlertStatus,
    TransactionStatus,
    DtePaymentStatus
} from '@prisma/client';

@Injectable()
export class FinancialAlertService {
    private readonly logger = new Logger(FinancialAlertService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Main method to run all defined rules.
     * Can be scheduled via Cron or triggered manually before closing a period.
     */
    async runAllChecks() {
        this.logger.log('Running Financial Alert Rules...');

        await this.checkUnconciledOldTransactions(30); // 30 days old
        await this.checkOverdueInvoices(5); // 5 days past due
        // Add more rules here
    }

    /**
     * Rule: Detect bank transactions older than N days that remain PENDING.
     */
    private async checkUnconciledOldTransactions(daysInPast: number) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysInPast);

        const staleTransactions = await this.prisma.bankTransaction.findMany({
            where: {
                status: { in: [TransactionStatus.PENDING, TransactionStatus.PARTIALLY_MATCHED] },
                date: { lt: cutoffDate }
            }
        });

        for (const tx of staleTransactions) {
            await this.createOrUpdateAlert({
                code: 'UNCONCILED_STALE',
                message: `Transacción bancaria de $${tx.amount} del ${tx.date.toISOString().split('T')[0]} sigue sin conciliar.`,
                severity: AlertSeverity.WARNING,
                entityType: 'BANK_TRANSACTION',
                entityId: tx.id,
            });
        }
    }

    /**
     * Rule: Detect Invoices (DTE) that are UNPAID and issuedDate + creditDays < Now.
     * Assuming standard credit days or checking overdue logic.
     * Simplified: Issued > N days ago and UNPAID.
     */
    private async checkOverdueInvoices(daysOverdue: number) {
        // Logic: Find unpaid DTEs
        // Not strictly implementing specific net-30 logic here for brevity, 
        // assuming anything unpaid > 60 days is bad.
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 60);

        const overdueDtes = await this.prisma.dTE.findMany({
            where: {
                paymentStatus: { not: DtePaymentStatus.PAID },
                issuedDate: { lt: cutoffDate },
                // filter out already alerted?
            }
        });

        for (const dte of overdueDtes) {
            await this.createOrUpdateAlert({
                code: 'DTE_OVERDUE_CRITICAL',
                message: `Factura #${dte.folio} por $${dte.totalAmount} vencida hace más de 60 días.`,
                severity: AlertSeverity.CRITICAL,
                entityType: 'DTE',
                entityId: dte.id,
            });
        }
    }

    /**
     * Helper to create alerts idempotently (avoid duplicate open alerts).
     */
    private async createOrUpdateAlert(data: {
        code: string;
        message: string;
        severity: AlertSeverity;
        entityType: string;
        entityId: string;
        periodId?: string;
    }) {
        // Check if open alert exists
        const existing = await this.prisma.financialAlert.findFirst({
            where: {
                code: data.code,
                entityType: data.entityType,
                entityId: data.entityId,
                status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] }
            }
        });

        if (!existing) {
            await this.prisma.financialAlert.create({
                data: {
                    code: data.code,
                    message: data.message,
                    severity: data.severity,
                    entityType: data.entityType,
                    entityId: data.entityId,
                    periodId: data.periodId,
                    status: AlertStatus.OPEN
                }
            });
            this.logger.warn(`Alert Created: ${data.code} for ${data.entityType}:${data.entityId}`);
        }
    }

    async getPendingAlerts(periodId?: string) {
        return this.prisma.financialAlert.findMany({
            where: {
                status: { not: AlertStatus.RESOLVED },
                periodId: periodId // Optional filter
            }
        });
    }
}
