import { AccountingPeriod, FinancialLedgerEntry } from '@prisma/client';

export interface ExportContext {
    period: AccountingPeriod;
    entries: FinancialLedgerEntry[];
}

export interface ExportResult {
    fileContent: string; // CSV content or Base64
    fileName: string;
    rowCount: number;
}
