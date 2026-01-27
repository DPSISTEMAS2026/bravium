
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DataOrigin, TransactionType } from '@prisma/client';
import * as XLSX from 'xlsx';

export interface DriveIngestDto {
    fileUrl?: string; // If public or presigned
    fileContentBase64?: string; // If passed directly
    metadata: {
        filename: string;
        bankName: string;
    };
}

@Injectable()
export class DriveIngestService {
    private readonly logger = new Logger(DriveIngestService.name);

    constructor(private prisma: PrismaService) { }

    async processDriveFile(dto: DriveIngestDto) {
        this.logger.log(`Processing Drive File: ${dto.metadata.filename} (${dto.metadata.bankName})`);

        let workbook: XLSX.WorkBook;

        // 1. Get Content
        if (dto.fileContentBase64) {
            workbook = XLSX.read(dto.fileContentBase64, { type: 'base64' });
        } else if (dto.fileUrl) {
            // Fetch content if URL provided
            const response = await fetch(dto.fileUrl);
            const buffer = await response.arrayBuffer();
            workbook = XLSX.read(buffer, { type: 'array' });
        } else {
            throw new Error('No file content provided');
        }

        // 2. Parse Sheets
        const sheetName = workbook.SheetNames[0];
        const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        this.logger.log(`Parsed ${rows.length} rows from Excel`);

        // 3. Find Bank Account
        // Heuristic: Find first account matching bankName
        const bankAccount = await this.prisma.bankAccount.findFirst({
            where: { bankName: { contains: dto.metadata.bankName, mode: 'insensitive' } }
        });

        if (!bankAccount) {
            this.logger.warn(`No bank account found for ${dto.metadata.bankName}. Using fallback/first.`);
            // fallback logic or error? Prompt says "simple code".
            // I'll throw to be explicit as per "user validation"
            throw new Error(`No Bank Account configured for bank: ${dto.metadata.bankName}`);
        }

        let processedCount = 0;

        // 4. Transform & Persist
        for (const row of rows) {
            // Mapping keys might vary. We try standard names or "normalized" keys from prompts commonly.
            // Prompt says: fecha, descripcion, monto, tipo
            const date = this.parseDate(row['Fecha'] || row['fecha'] || row['Date']);
            const description = row['Descripcion'] || row['Description'] || row['Movimiento'] || 'Sin descripción';
            // Amount handling: sometimes "Cargo" and "Abono" are separate columns, sometimes "Monto" with sign
            let amount = 0;

            if (row['Monto']) amount = Number(row['Monto']);
            else if (row['Amount']) amount = Number(row['Amount']);
            else if (row['Cargo']) amount = -Math.abs(Number(row['Cargo'])); // Outflow
            else if (row['Abono']) amount = Math.abs(Number(row['Abono']));   // Inflow

            if (isNaN(amount) || !date) continue; // Skip invalid

            const type: TransactionType = amount >= 0 ? 'CREDIT' : 'DEBIT';

            // Duplicate Check
            const existing = await this.prisma.bankTransaction.findFirst({
                where: {
                    bankAccountId: bankAccount.id,
                    amount: amount,
                    date: date,
                    description: description
                }
            });

            if (!existing) {
                await this.prisma.bankTransaction.create({
                    data: {
                        bankAccountId: bankAccount.id,
                        date: date,
                        amount: amount,
                        description: description,
                        type: type,
                        origin: DataOrigin.N8N_AUTOMATION, // As per prompt context "drive/n8n"
                        metadata: { sourceFile: dto.metadata.filename }
                    }
                });
                processedCount++;
            }
        }

        return { processed: processedCount, bankAccount: bankAccount.bankName };
    }

    private parseDate(val: any): Date | null {
        if (!val) return null;
        if (val instanceof Date) return val;
        // Handle Excel numeric dates if needed, or string parsing
        // XLSX usually handles this if cell format is Date, returns Date obj.
        // If string "DD/MM/YYYY":
        if (typeof val === 'string' && val.includes('/')) {
            const [d, m, y] = val.split('/');
            return new Date(`${y}-${m}-${d}`);
        }
        return new Date(val);
    }
}
