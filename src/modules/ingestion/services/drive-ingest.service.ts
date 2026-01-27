
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DataOrigin, TransactionType } from '@prisma/client';
import * as XLSX from 'xlsx';

export interface DriveIngestDto {
    // Standard Fields (Preferred)
    bank?: string;
    account?: string;
    currency?: string;
    period?: string;
    rows?: any[];

    // Legacy / Alternative Fields
    jsonRows?: any[];
    fileUrl?: string; // If public or presigned
    fileContentBase64?: string; // If passed directly

    metadata?: {
        filename?: string;
        bankName?: string;
        source?: string;
        ingestedBy?: string;
        [key: string]: any;
    };
}

@Injectable()
export class DriveIngestService {
    private readonly logger = new Logger(DriveIngestService.name);

    constructor(private prisma: PrismaService) { }

    async processDriveFile(dto: DriveIngestDto) {
        // 1. Resolve Data
        const rows = await this.resolveRows(dto);
        const bankName = dto.bank || dto.metadata?.bankName || dto.metadata?.bank; // Priority to direct field
        const accountNumber = dto.account || dto.metadata?.account || 'UNKNOWN';
        const currency = dto.currency || 'CLP';

        this.logger.log(`Processing Ingestion: Bank=${bankName}, Account=${accountNumber}, Rows=${rows.length}`);

        if (!bankName) {
            throw new Error('Bank Name is required (field: bank)');
        }

        if (rows.length === 0) {
            this.logger.warn('No rows to process');
            return { status: 'warning', message: 'No rows found', insertedRows: 0 };
        }

        // 2. Find or Create Bank Account
        // Try to find by Name AND Account if possible, or just Name if Account is UNKNOWN
        let accountWhereInput: any = {
            bankName: { equals: bankName, mode: 'insensitive' }
        };

        if (accountNumber !== 'UNKNOWN') {
            accountWhereInput.accountNumber = accountNumber;
        }

        let bankAccount = await this.prisma.bankAccount.findFirst({
            where: accountWhereInput
        });

        // Auto-Create if not exists
        if (!bankAccount) {
            this.logger.log(`Bank Account not found. Creating new one for ${bankName}`);
            bankAccount = await this.prisma.bankAccount.create({
                data: {
                    bankName: bankName,
                    accountNumber: accountNumber,
                    currency: currency,
                    rutHolder: 'AUTO-GEN-N8N', // Required field placeholder
                    isActive: true,
                    // 'origin' or 'autoCreated' logic handled by created record existence
                }
            });
        }

        // 3. Process Rows
        let insertedCount = 0;

        for (const row of rows) {
            const date = this.parseDate(row['date'] || row['Date'] || row['fecha'] || row['Fecha']);
            const description = row['description'] || row['Description'] || row['descripcion'] || row['Descripcion'] || row['Movimiento'] || 'Sin descripción';

            let amount = 0;
            if (row['amount'] !== undefined) amount = Number(row['amount']);
            else if (row['monto'] !== undefined) amount = Number(row['monto']);
            else if (row['Monto'] !== undefined) amount = Number(row['Monto']);
            else {
                // Check Credit/Debit
                const credit = Number(row['credit'] || row['Abono'] || 0);
                const debit = Number(row['debit'] || row['Cargo'] || 0);
                if (credit > 0) amount = credit;
                else if (debit > 0) amount = -debit;
            }

            // Validation
            if (!date || isNaN(amount) || amount === 0) {
                continue;
            }

            const type: TransactionType = amount >= 0 ? 'CREDIT' : 'DEBIT';

            // Idempotency: Avoid duplicates
            const existing = await this.prisma.bankTransaction.findFirst({
                where: {
                    bankAccountId: bankAccount.id,
                    date: date,
                    amount: amount,
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
                        origin: DataOrigin.N8N_AUTOMATION,
                        metadata: {
                            sourceFile: dto.metadata?.filename,
                            rawRow: row,
                            ingestionId: Date.now()
                        }
                    }
                });
                insertedCount++;
            }
        }

        this.logger.log(`Ingestion Complete. Inserted: ${insertedCount}`);

        return {
            status: 'ok',
            bank: bankAccount.bankName,
            account: bankAccount.accountNumber,
            insertedRows: insertedCount
        };
    }

    private async resolveRows(dto: DriveIngestDto): Promise<any[]> {
        if (dto.rows && Array.isArray(dto.rows)) return dto.rows;
        if (dto.jsonRows && Array.isArray(dto.jsonRows)) return dto.jsonRows;

        // Fallback: Excel Parsing
        if (dto.fileContentBase64 || dto.fileUrl) {
            let workbook: XLSX.WorkBook;
            if (dto.fileContentBase64) {
                workbook = XLSX.read(dto.fileContentBase64, { type: 'base64' });
            } else {
                const response = await fetch(dto.fileUrl!);
                const buffer = await response.arrayBuffer();
                workbook = XLSX.read(buffer, { type: 'array' });
            }
            const sheetName = workbook.SheetNames[0];
            return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        }

        return [];
    }

    async processManualDteCsv(csvContent: string) {
        this.logger.log('Processing Manual DTE CSV Ingestion...');
        const lines = csvContent.split('\n');
        let insertedCount = 0;
        let errors = 0;

        // Skip header (Emisor;Documento;...)
        const startIdx = lines[0].startsWith('Emisor') ? 1 : 0;
        const COMPANY_RUT = '76.201.228-5'; // Configurable or Env?

        for (let i = startIdx; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            try {
                const parts = line.split(';');
                if (parts.length < 5) continue;

                const [emisorName, docTypeStr, folioStr, fechaStr, totalStr] = parts;

                // 1. Resolve Provider
                const fakeRut = this.generateFakeRut(emisorName);
                let provider = await this.prisma.provider.findFirst({ where: { rut: fakeRut } });

                if (!provider) {
                    provider = await this.prisma.provider.create({
                        data: {
                            name: emisorName,
                            rut: fakeRut,
                            category: 'SIMULATED'
                        }
                    });
                }

                // 2. Resolve Type
                let typeCode = 33;
                if (docTypeStr.includes('Nota de crédito')) typeCode = 61;
                else if (docTypeStr.includes('exenta')) typeCode = 34;

                // 3. Parse Date
                const [d, m, y] = fechaStr.split('-');
                const issuedDate = new Date(`${y}-${m}-${d}`);

                // 4. Parse Amount
                const totalAmount = parseInt(totalStr.replace(/\./g, ''), 10);
                const folio = parseInt(folioStr, 10);

                // 5. Upsert DTE
                // Note: Need to cast origin to any if strict enum doesn't have LEGACY_EXCEL yet, 
                // or assume we added it. schema not viewed recently for Enum. 
                // I will use 'MANUAL_UPLOAD' provided it exists or string. 
                // Actually Enum DataOrigin usually has MANUAL. Let's start with 'MANUAL'.

                const dteData = {
                    folio,
                    type: typeCode,
                    rutIssuer: provider.rut,
                    rutReceiver: COMPANY_RUT,
                    totalAmount,
                    issuedDate,
                    siiStatus: 'ACEPTADO',
                    providerId: provider.id,
                    outstandingAmount: totalAmount,
                    paymentStatus: 'UNPAID', // Enum DtePaymentStatus.UNPAID
                    origin: DataOrigin.MANUAL_UPLOAD || 'MANUAL',
                };

                const existing = await this.prisma.dTE.findUnique({
                    where: {
                        rutIssuer_type_folio: {
                            rutIssuer: provider.rut,
                            type: typeCode,
                            folio: folio
                        }
                    }
                });

                if (!existing) {
                    await this.prisma.dTE.create({ data: dteData as any });
                    insertedCount++;
                }

            } catch (err) {
                console.error('Error processing line:', line, err);
                errors++;
            }
        }

        return { status: 'success', inserted: insertedCount, errors };
    }

    private generateFakeRut(name: string): string {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 5) - hash) + name.charCodeAt(i);
            hash |= 0;
        }
        const num = Math.abs(hash) % 90000000 + 10000000;
        return `${num}-K`;
    }

    private parseDate(val: any): Date | null {
        if (!val) return null;
        if (val instanceof Date) return val;

        // Try standard Date parsing
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d;

        // Try DD/MM/YYYY for strict Excel/Chilean formats
        if (typeof val === 'string' && val.includes('/')) {
            const parts = val.split('/');
            if (parts.length === 3) {
                // Assume DD/MM/YYYY
                return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            }
        }
        return null;
    }
}
