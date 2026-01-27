import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LedgerEntryType, ReferenceType } from '@prisma/client';
import { LedgerService } from './ledger.service';

export interface LegacyRowDto {
    providerId: string;
    date: Date;
    amount: number; // Signed: Positive=Debt, Negative=Payment
    description: string;
    rawJson: any; // The full row from Excel
    userComment?: string;
    createdBy: string;
}

@Injectable()
export class HistoricalImportService {
    private readonly logger = new Logger(HistoricalImportService.name);

    constructor(
        private prisma: PrismaService,
        private ledgerService: LedgerService
    ) { }

    /**
     * Imports a row from the Legacy Excel as a permanent Financial Ledger Entry.
     * Does NOT try to find a match. It simply records the financial fact.
     */
    async importLegacyRow(dto: LegacyRowDto) {
        // 1. Identify Type roughly based on sign
        // If amount is negative, likely a Payment or Credit Note
        // If amount is positive, likely an Invoice or Debit Note
        // However, users might define specific types in Excel. 
        // Defaulting to MANUAL_ENTRY for generic import.

        // Check if duplicate? Using rawJson or some unique key from Excel?
        // Assuming unique check handles outside or simply append.

        const entry = await this.ledgerService.recordEntry({
            providerId: dto.providerId,
            transactionDate: dto.date,
            type: LedgerEntryType.MANUAL_ENTRY,
            amount: dto.amount,
            referenceType: ReferenceType.LEGACY_EXCEL,
            referenceId: 'MIGRATION_' + new Date().getTime(), // Or unique ID from Excel row
            description: `[MIGRATION] ${dto.description} | ${dto.userComment || ''}`,
            // We need to extend LedgerService to accept metadata or do direct create here
        });

        // Update metadata directly since LedgerService might be strict simple DTO
        await this.prisma.financialLedgerEntry.update({
            where: { id: entry.id },
            data: {
                metadata: dto.rawJson,
                createdBy: dto.createdBy
            }
        });

        this.logger.log(`Imported legacy row for provider ${dto.providerId}: ${dto.amount}`);
        return entry;
    }
}
