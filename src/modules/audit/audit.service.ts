import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AuditContext {
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    organizationId?: string;
    systemEvent?: boolean;
}

export interface AuditPayload {
    action: string;
    entityType: string;
    entityId: string;
    previousValue?: any;
    newValue?: any;
    metadata?: any;
}

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Logs a critical system action.
     * Async to not block the main transaction flow, unless critical.
     */
    async logAction(context: AuditContext, payload: AuditPayload) {
        try {
            await this.prisma.auditLog.create({
                data: {
                    action: payload.action,
                    entityType: payload.entityType,
                    entityId: payload.entityId,

                    userId: context.userId,
                    systemEvent: context.systemEvent || false,
                    ipAddress: context.ipAddress,
                    userAgent: context.userAgent,
                    organizationId: context.organizationId,

                    previousValue: payload.previousValue,
                    newValue: payload.newValue,
                    metadata: payload.metadata,
                }
            });
            // Silent success
        } catch (error) {
            // Typically we don't fail the transaction if audit fails log, BUT for financial systems potentially yes.
            // For now, log error to stdout.
            this.logger.error(`Failed to create audit log: ${error.message}`);
        }
    }
}
