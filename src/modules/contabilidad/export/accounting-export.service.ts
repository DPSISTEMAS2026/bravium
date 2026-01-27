import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ExportFormat, ExportStatus, PeriodStatus } from '@prisma/client';
import { IExportStrategy } from './strategies/export-strategy.interface';
import { NuboxExportStrategy } from './strategies/nubox-export.strategy';

@Injectable()
export class AccountingExportService {
    private readonly logger = new Logger(AccountingExportService.name);
    private strategies: Map<ExportFormat, IExportStrategy> = new Map();

    constructor(private prisma: PrismaService) {
        this.registerStrategy(new NuboxExportStrategy());
        // TODO: Register SIIStrategy, etc.
    }

    private registerStrategy(strategy: IExportStrategy) {
        this.strategies.set(strategy.format, strategy);
    }

    /**
     * Executes an accounting export for a given period.
     * Enforces rules: Period must be CLOSED (or at least valid).
     */
    async executeExport(periodId: string, format: ExportFormat, userId: string) {
        this.logger.log(`Starting export (Format: ${format}) for period ${periodId}`);

        // 1. Validation
        const period = await this.prisma.accountingPeriod.findUnique({ where: { id: periodId } });
        if (!period) throw new BadRequestException('Period not found');

        if (period.status === PeriodStatus.OPEN) {
            // Warning or Block? Strict accounting usually demands closed periods.
            // Let's allow but with BIG WARNING logs, or just block.
            // Prompt asked for "Solo períodos CLOSED" in strict rules.
            throw new BadRequestException('Cannot export an OPEN period. Close it first.');
        }

        // 2. Resolve Strategy
        const strategy = this.strategies.get(format);
        if (!strategy) throw new BadRequestException(`Format ${format} not supported`);

        // 3. Create Job (Pending)
        const job = await this.prisma.exportJob.create({
            data: {
                periodId: period.id,
                format,
                status: ExportStatus.PROCESSING,
                createdBy: userId,
                rowCount: 0
            }
        });

        try {
            // 4. Fetch Data (Source of Truth: Ledger)
            // Only entries strictly within the period? 
            // Or entries LINKED to the period via periodId?
            // Strict Accounting: Entries belonging to the Period.
            const entries = await this.prisma.financialLedgerEntry.findMany({
                where: {
                    // Using transactionDate filter or periodId if populated
                    transactionDate: {
                        gte: period.startDate,
                        lte: period.endDate
                    }
                },
                orderBy: { transactionDate: 'asc' }
            });

            // 5. Generate Artifact
            const result = await strategy.generate({ period, entries });

            // 6. Save Snapshot (Mocking Storage)
            // In prod: Upload to S3/GCS.
            const mockStorageUrl = `s3://bravium-exports/${result.fileName}`;

            // 7. Complete Job
            return await this.prisma.exportJob.update({
                where: { id: job.id },
                data: {
                    status: ExportStatus.COMPLETED,
                    fileUrl: mockStorageUrl,
                    rowCount: result.rowCount,
                    // Store blob locally for MVP if needed, but returning URL is standard.
                }
            });

        } catch (error) {
            this.logger.error(`Export failed: ${error.message}`);
            await this.prisma.exportJob.update({
                where: { id: job.id },
                data: { status: ExportStatus.FAILED }
            });
            throw error;
        }
    }
}
