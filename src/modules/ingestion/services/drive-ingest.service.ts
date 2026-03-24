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
            await this.transactionsService.deleteTransactionsBySourceFile(filename);
        }

        if (filename) {
            const alreadyProcessed = await this.isFileAlreadyProcessed(filename);
            if (alreadyProcessed) {
                this.logger.log(`SKIP: "${filename}" ya fue procesado anteriormente.`);
                return { status: 'skipped', message: `Archivo "${filename}" ya ingresado`, insertedRows: 0 };
            }
        }

        // 1. Resolve Data
        const rows = await this.resolveRows(dto);
        const bankName = dto.bank || dto.metadata?.bankName || dto.metadata?.bank;
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

        if (dto.organizationId) {
            accountWhereInput.organizationId = dto.organizationId;
        }

        let bankAccount = await this.prisma.bankAccount.findFirst({
            where: accountWhereInput
        });

        if (!bankAccount) {
            this.logger.log(`Bank Account not found. Creating new one for ${bankName}`);
            bankAccount = await this.prisma.bankAccount.create({
                data: {
                    bankName: bankName,
                    accountNumber: accountNumber,
                    currency: currency,
                    rutHolder: 'AUTO-GEN-N8N', // Required field placeholder
                    isActive: true,
                    organizationId: dto.organizationId || null,
                }
            });
        }

        // 3. Smart Pre-Processing with AI (Simulation or Real if Key present)
        // We use AI to clean and normalize the rows before persisting
        const normalizedRows = await this.openai.normalizeBankRows(rows);

        // 4. Process Rows
        let insertedCount = 0;

        for (const row of normalizedRows) {
            // If AI worked, fields are already named 'date', 'amount', 'description'
            const dateStr = row['date'] || row['Date'] || row['fecha'] || row['Fecha'];
            const date = this.parseDate(dateStr);

            let description = row['description'] || row['Description'] || row['descripcion'] || row['Movimiento'] || 'Sin descripción';

            // Cuota: extraer de OpenAI (cuotaNumero, cuotaTotal, montoOrigen) o de columnas Excel (N°CUOTA, MONTO ORIGEN...)
            let cuotaNumero: number | null = row['cuotaNumero'] != null ? Number(row['cuotaNumero']) : null;
            let cuotaTotal: number | null = row['cuotaTotal'] != null ? Number(row['cuotaTotal']) : null;
            if (cuotaNumero == null || cuotaTotal == null) {
                const raw = row['N°CUOTA'] ?? row['Cuota'] ?? row['Nº CUOTA'] ?? row['cuota'];
                const match = raw ? String(raw).trim().match(/^(\d+)\s*\/\s*(\d+)$/) : null;
                if (match) {
                    cuotaNumero = parseInt(match[1], 10);
                    cuotaTotal = parseInt(match[2], 10);
                }
            }
            const montoOrigen = row['montoOrigen'] ?? row['MONTO ORIGEN OPERACIÓN O COBRO'] ?? row['Monto Origen'] ?? row['MONTO ORIGEN'];
            const montoOrigenNum = montoOrigen != null ? Number(String(montoOrigen).replace(/\./g, '')) : NaN;
            if (cuotaNumero != null && cuotaTotal != null) {
                const parteZ = !isNaN(montoOrigenNum) && montoOrigenNum > 0
                    ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(montoOrigenNum)
                    : '';
                description = `Cuota ${cuotaNumero}/${cuotaTotal} de compra ${parteZ}${description ? ' - ' + description : ''}`.trim();
            }

            let amount = 0;
            if (row['amount'] !== undefined) amount = Number(row['amount']);
            else if (row['monto'] !== undefined) amount = Number(row['monto']);
            // ... the rest of the existing fallback logic below
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

            // Algunas cartolas (ej. TC) exportan cobros como positivo y abonos como negativo; invertir si aplica
            if (dto.metadata?.invertAmountSign) {
                amount = -amount;
            }

            let type: TransactionType = amount >= 0 ? 'CREDIT' : 'DEBIT';
            let finalAmount = amount;
            // Si en la descripción aparece " DE " (ej. "PAGO DE X", "TRANSFERENCIA DE Y"), marcar como abono (CREDIT); el movimiento queda PENDING para comentario si hace falta
            const descNorm = (description || '').toUpperCase().trim();
            if (descNorm.startsWith('DE ') || /\sDE\s/.test(descNorm) || descNorm.endsWith(' DE')) {
                type = 'CREDIT';
                if (finalAmount < 0) finalAmount = Math.abs(finalAmount);
            }

            // Detección simple de cuotas (standby: solo guardar flag en metadata para uso futuro)
            const rawRowStr = JSON.stringify(row).toLowerCase();
            const esCuota = /cuota|n°?\s*cuota|\d+\s*\/\s*\d+/.test(rawRowStr) || Object.keys(row).some((k) => /cuota|installment/i.test(k));

            // No deduplicar por (cuenta, fecha, monto, descripción): varias compras legítimas pueden coincidir
            // (ej. mismo monto mismo día Apple). La idempotencia a nivel archivo la hace isFileAlreadyProcessed.
            await this.prisma.bankTransaction.create({
                data: {
                    bankAccountId: bankAccount.id,
                    date: date,
                    amount: finalAmount,
                    description: description,
                    type: type,
                    origin: DataOrigin.N8N_AUTOMATION,
                    metadata: {
                        sourceFile: dto.metadata?.filename,
                        rawRow: row,
                        ingestionId: Date.now(),
                        ...(esCuota && { esCuota: true }),
                    }
                }
            });
            insertedCount++;
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
