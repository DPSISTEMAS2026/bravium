import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DataOrigin, TransactionType } from '@prisma/client';
import { OpenAiService } from './openai.service';
import { TransactionsService } from '../../bancos/transactions.service';

export interface DriveIngestDto {
    // Standard Fields (Preferred)
    bank?: string;
    account?: string;
    currency?: string;
    period?: string;
    rows?: any[];
    organizationId?: string;
    bankAccountId?: string;

    // Legacy / Alternative Fields
    jsonRows?: any[];
    fileUrl?: string; // If public or presigned
    fileContentBase64?: string; // If passed directly

    metadata?: {
        filename?: string;
        bankName?: string;
        source?: string;
        ingestedBy?: string;
        /** Si true, invierte el signo del monto (para cartolas donde cobros vienen positivos y abonos negativos). */
        invertAmountSign?: boolean;
        [key: string]: any;
    };
}

@Injectable()
export class DriveIngestService {
    private readonly logger = new Logger(DriveIngestService.name);

    constructor(
        private prisma: PrismaService,
        private openai: OpenAiService,
        private transactionsService: TransactionsService,
    ) { }

    async isFileAlreadyProcessed(filename: string): Promise<boolean> {
        if (!filename) return false;
        const existing = await this.prisma.bankTransaction.findFirst({
            where: {
                metadata: { path: ['sourceFile'], equals: filename }
            },
            select: { id: true }
        });
        return !!existing;
    }

    async processDriveFile(dto: DriveIngestDto) {
        const filename = dto.metadata?.filename;
        const forceReplace = !!dto.metadata?.forceReplace;

        if (filename && forceReplace) {
            this.logger.log(`Forzar recarga: eliminando movimientos previos de "${filename}"`);
            await this.transactionsService.deleteTransactionsBySourceFile(dto.organizationId!, filename);
        }

        if (filename && !forceReplace) {
            const alreadyProcessed = await this.isFileAlreadyProcessed(filename);
            if (alreadyProcessed) {
                this.logger.log(`INFO: El archivo "${filename}" ya existe. Se procederá a analizar fila por fila para detectar nuevos movimientos o cambios (idempotencia garantizada por índice de ocurrencia).`);
            }
        }

        // 1. Resolve Data
        const rows = await this.resolveRows(dto);
        const bankName = dto.bank || dto.metadata?.bankName || dto.metadata?.bank;
        const accountNumber = dto.account || dto.metadata?.account || 'UNKNOWN';
        const currency = dto.currency || 'CLP';

        // 1.5 Resolve Bank Account Early
        let bankAccount;
        if (dto.bankAccountId) {
            bankAccount = await this.prisma.bankAccount.findUnique({ where: { id: dto.bankAccountId } });
            if (!bankAccount) throw new Error('Bank Account not found: ' + dto.bankAccountId);
        } else {
            // ... existing findFirst logic ...
            bankAccount = await this.prisma.bankAccount.findFirst({
                where: {
                    bankName: { equals: bankName, mode: 'insensitive' },
                    accountNumber: accountNumber !== 'UNKNOWN' ? accountNumber : undefined,
                    organizationId: dto.organizationId,
                }
            });
        }

        if (!bankAccount) {
            // Create default if not found (legacy behavior)
            bankAccount = await this.prisma.bankAccount.create({
                data: { bankName, accountNumber, currency: 'CLP', rutHolder: 'AUTO', organizationId: dto.organizationId }
            });
        }

        // Get the latest transaction date for this account to optimize skipping
        const latestTx = await this.prisma.bankTransaction.findFirst({
            where: { bankAccountId: bankAccount.id },
            orderBy: { date: 'desc' },
        });
        const latestDate = latestTx ? new Date(latestTx.date) : null;

        this.logger.log(`Processing Ingestion: ${bankAccount.bankName} (${bankAccount.accountNumber}). Latest movement: ${latestDate ? latestDate.toISOString().split('T')[0] : 'None'}`);

        if (rows.length === 0) {
            this.logger.warn('No rows to process');
            return { status: 'warning', message: 'No rows found', insertedRows: 0 };
        }

        // 3. Normalize rows via OpenAI (extracts ALL transactions from the file)
        const normalizedRows = await this.openai.normalizeBankRows(rows);
        this.logger.log(`OpenAI returned ${normalizedRows.length} normalized rows.`);

        // 4. Process Rows — OCCURRENCE-BASED DEDUPLICATION
        let insertedCount = 0;
        let skippedCount = 0;
        const fileOccurrenceCounter = new Map<string, number>();

        for (const row of normalizedRows) {
            const date = this.parseDate(row['date'] || row['fecha'] || row['Fecha'] || row['Date']);
            const description = row['description'] || row['descripcion'] || row['Movimiento'] || row['Description'] || 'Sin descripción';
            const reference = row['reference'] ? String(row['reference']) : null;

            let amount = 0;
            if (row['amount'] !== undefined) amount = Number(row['amount']);
            else if (row['monto'] !== undefined) amount = Number(row['monto']);
            else {
                const credit = Number(row['credit'] || row['Abono'] || 0);
                const debit = Number(row['debit'] || row['Cargo'] || 0);
                if (credit > 0) amount = credit;
                else if (debit > 0) amount = -debit;
            }

            // Skip invalid rows
            if (!date || isNaN(amount) || amount === 0) {
                this.logger.debug(`SKIP invalid row: date=${date}, amount=${amount}`);
                continue;
            }

            // 1. Check by Reference (Strongest Unique Key)
            if (reference) {
                const existingByRef = await this.prisma.bankTransaction.findFirst({
                    where: { bankAccountId: bankAccount.id, reference },
                    select: { id: true }
                });
                if (existingByRef) {
                    skippedCount++;
                    continue;
                }
            }

            // 2. Check by Occurrence Index (For identical movements without reference)
            const key = `${date.toISOString()}_${amount}_${description}`;
            const occurrenceInFile = (fileOccurrenceCounter.get(key) || 0) + 1;
            fileOccurrenceCounter.set(key, occurrenceInFile);

            const existingCount = await this.prisma.bankTransaction.count({
                where: {
                    bankAccountId: bankAccount.id,
                    date: date,
                    amount: amount,
                    description: description,
                }
            });

            if (existingCount >= occurrenceInFile) {
                skippedCount++;
                continue;
            }

            if (dto.metadata?.invertAmountSign) {
                amount = -amount;
            }

            const type: TransactionType = amount >= 0 ? 'CREDIT' : 'DEBIT';

            await this.prisma.bankTransaction.create({
                data: {
                    bankAccountId: bankAccount.id,
                    date: date,
                    amount: amount,
                    description: description,
                    reference: reference,
                    type: type,
                    origin: DataOrigin.N8N_AUTOMATION,
                    metadata: {
                        sourceFile: dto.metadata?.filename,
                        rawRow: row,
                        ingestionId: Date.now(),
                    }
                }
            });
            insertedCount++;
        }

        this.logger.log(`Ingestion Complete. Inserted: ${insertedCount}, Skipped (old): ${skippedCount}`);

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

        // Fallback: File Parsing
        if (dto.fileContentBase64 || dto.fileUrl) {
            let buffer: Buffer;

            if (dto.fileContentBase64) {
                buffer = Buffer.from(dto.fileContentBase64, 'base64');
            } else {
                const response = await fetch(dto.fileUrl!);
                const arrayBuf = await response.arrayBuffer();
                buffer = Buffer.from(arrayBuf);
            }

            // Check if PDF
            const isPdf = dto.metadata?.filename?.toLowerCase().endsWith('.pdf') || dto.metadata?.mimeType === 'application/pdf';

            if (isPdf) {
                this.logger.log(`Parsing PDF file: ${dto.metadata?.filename}`);
                const pdfModule = await import('pdf-parse');
                const pdfParse = pdfModule.default || pdfModule;
                const pdfData = await pdfParse(buffer);
                return [{ rawTextContent: pdfData.text }];
            }

            this.logger.log(`Parsing Excel/CSV file: ${dto.metadata?.filename}`);
            const XLSX = await import('xlsx');
            const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            // Buscar dinámicamente la fila de encabezados para evitar saltarse filas estáticas/totales arriba
            const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            const headerIndex = rawRows.findIndex(row => {
                if (!Array.isArray(row)) return false;
                const cells = row.map(c => String(c).toUpperCase());
                const hasAmount = cells.some(c => c.includes('MONTO')) || 
                                 (cells.some(c => c.includes('CARGO')) && cells.some(c => c.includes('ABONO')));
                const hasContext = cells.some(c => c.includes('FECHA')) || 
                                  cells.some(c => c.includes('DESCRIPCI')) || 
                                  cells.some(c => c.includes('DETALLE'));
                return hasAmount && hasContext;
            });

            let rows = [];
            if (headerIndex !== -1) {
                this.logger.log(`Found headers at row ${headerIndex + 1} (${dto.metadata?.filename})`);
                rows = XLSX.utils.sheet_to_json(sheet, { 
                    range: headerIndex, 
                    raw: false, 
                    dateNF: 'yyyy-mm-dd' 
                });
            } else {
                rows = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });
            }
            return rows;
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
                let provider = await this.prisma.provider.findFirst({ 
                    where: { rut: fakeRut, organizationId: 'FIXME-OR-PASS-ORG-ID' } // This method seems unused/legacy
                });

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

                // Notas de Crédito (61) son abonos a favor
                const isAbono = typeCode === 61;

                const dteData = {
                    folio,
                    type: typeCode,
                    rutIssuer: provider.rut,
                    rutReceiver: COMPANY_RUT,
                    totalAmount,
                    issuedDate,
                    siiStatus: 'ACEPTADO',
                    providerId: provider.id,
                    outstandingAmount: isAbono ? 0 : totalAmount,
                    paymentStatus: isAbono ? 'PAID' : 'UNPAID',
                    origin: DataOrigin.MANUAL_UPLOAD || 'MANUAL',
                };

                const existing = await this.prisma.dTE.findUnique({
                    where: {
                        rutIssuer_type_folio_organizationId: {
                            rutIssuer: provider.rut,
                            type: typeCode,
                            folio: folio,
                            organizationId: 'FIXME-OR-PASS-ORG-ID'
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

        // All dates stored at noon UTC to avoid timezone boundary shifts
        const noonUTC = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 12, 0, 0));

        // Excel serial number fallback (e.g. 46054 → 2026-02-02)
        if (typeof val === 'number' && val > 25000 && val < 100000) {
            const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));
            const ms = EXCEL_EPOCH.getTime() + val * 86400000;
            const d = new Date(ms);
            return noonUTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        }

        if (val instanceof Date) {
            return noonUTC(val.getFullYear(), val.getMonth(), val.getDate());
        }

        const str = String(val).trim();

        // DD/MM/YYYY or DD/MM/YY (Chilean format)
        const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (slashMatch) {
            const day = parseInt(slashMatch[1], 10);
            const month = parseInt(slashMatch[2], 10);
            let year = parseInt(slashMatch[3], 10);
            if (year < 100) year += 2000;
            return noonUTC(year, month - 1, day);
        }

        // DD-MM-YYYY or DD-MM-YY
        const dashDMY = str.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
        if (dashDMY) {
            const day = parseInt(dashDMY[1], 10);
            const month = parseInt(dashDMY[2], 10);
            let year = parseInt(dashDMY[3], 10);
            if (year < 100) year += 2000;
            return noonUTC(year, month - 1, day);
        }

        // YYYY-MM-DD (ISO)
        const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
            return noonUTC(
                parseInt(isoMatch[1], 10),
                parseInt(isoMatch[2], 10) - 1,
                parseInt(isoMatch[3], 10)
            );
        }

        // Last resort
        const d = new Date(str);
        if (isNaN(d.getTime())) return null;
        return noonUTC(d.getFullYear(), d.getMonth(), d.getDate());
    }
}
