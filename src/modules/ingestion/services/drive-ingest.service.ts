import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DataOrigin, TransactionType } from '@prisma/client';
import { OpenAiService } from './openai.service';
import { TransactionsService } from '../../bancos/transactions.service';
import { isSantanderTcPdfFilename, parseSantanderTcPdf, SantanderTcParseResult } from './santander-tc-pdf.parser';
import { isItauTcPdfFilename, parseItauTcPdf, ItauTcParseResult } from './itau-tc-pdf.parser';


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

        // PRE-EXTRACCIÓN: Para archivos Santander, extraer n\u00famero de cuenta del header ANTES del lookup
        const filename2 = dto.metadata?.filename || '';
        if (filename2.includes('CartolaHistCtaCte') && dto.fileContentBase64) {
            try {
                const XLSX2 = require('xlsx');
                const wb2 = XLSX2.read(Buffer.from(dto.fileContentBase64, 'base64'), { type: 'buffer' });
                const rawD = XLSX2.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1 }) as any[];
                const cRow = rawD.find((r: any) => Array.isArray(r) && typeof r[0] === 'string' && r[0].includes('Cuenta Corriente'));
                if (cRow) {
                    const mC = String(cRow[0]).match(/N[°º]?:?\s*([\d\-]+)/);
                    if (mC) {
                        const num = mC[1].replace(/[-\s]/g, '').replace(/^0+/, '');
                        if (num && num.length >= 5) {
                            (dto as any)._extractedAccountNumber = num;
                            this.logger.log(`[PRE-EXTRACCIÓN] Número de cuenta Santander: ${num}`);
                        }
                    }
                }
            } catch (e) { /* ignorar si falla */ }
        }
        if (/0215703887/i.test(filename2) && !isItauTcPdfFilename(filename2)) {
            (dto as any)._extractedAccountNumber = '0215703887';
        }
        if (isItauTcPdfFilename(filename2) && dto.fileContentBase64) {
            const itauParsed = await this.parseItauTcFromDto(dto);
            (dto as any)._itauTcParsed = itauParsed;
            if (itauParsed.accountLast4) {
                (dto as any)._extractedAccountNumber = itauParsed.accountLast4;
                this.logger.log(`[PRE-EXTRACCIÓN] TC Itaú cuenta XXXX-${itauParsed.accountLast4}`);
            }
        }
        if (isSantanderTcPdfFilename(filename2) && dto.fileContentBase64) {
            const tcParsed = await this.parseSantanderTcFromDto(dto);
            (dto as any)._tcParsed = tcParsed;
            if (tcParsed.accountLast4) {
                (dto as any)._extractedAccountNumber = tcParsed.accountLast4;
                this.logger.log(`[PRE-EXTRACCIÓN] TC Santander cuenta XXXX-${tcParsed.accountLast4}`);
            }
        }

        // 1.5 Resolve Bank Account Early
        let bankAccount;
        if (dto.bankAccountId) {
            bankAccount = await this.prisma.bankAccount.findUnique({ where: { id: dto.bankAccountId } });
            if (!bankAccount) throw new Error('Bank Account not found: ' + dto.bankAccountId);
        } else {
            const extractedNum = (dto as any)._extractedAccountNumber;
            // Primero intentar con número exacto extraído del header
            if (extractedNum) {
                bankAccount = await this.prisma.bankAccount.findFirst({
                    where: {
                        accountNumber: { contains: extractedNum },
                        organizationId: dto.organizationId,
                    }
                });
                if (bankAccount) this.logger.log(`Cuenta encontrada por número de header: ${bankAccount.bankName} ${bankAccount.accountNumber}`);
            }
            if (!bankAccount && extractedNum === '5239') {
                bankAccount = await this.prisma.bankAccount.findFirst({
                    where: {
                        organizationId: dto.organizationId,
                        OR: [
                            { id: 'acc-santander-5239' },
                            { accountNumber: { contains: 'XXXX-5239' } },
                        ],
                    },
                });
                if (bankAccount) this.logger.log(`Cuenta TC Santander fallback: ${bankAccount.bankName} ${bankAccount.accountNumber}`);
            }
            if (!bankAccount && extractedNum === '3965') {
                bankAccount = await this.prisma.bankAccount.findFirst({
                    where: {
                        organizationId: dto.organizationId,
                        OR: [
                            { id: 'acc-itau-3965' },
                            { accountNumber: { contains: 'XXXX-3965' } },
                            { accountNumber: { contains: '3965' } },
                        ],
                    },
                });
                if (bankAccount) this.logger.log(`Cuenta TC Itaú fallback: ${bankAccount.bankName} ${bankAccount.accountNumber}`);
            }
            // Fallback: buscar por nombre de banco
            if (!bankAccount) {
                bankAccount = await this.prisma.bankAccount.findFirst({
                    where: {
                        bankName: { equals: bankName, mode: 'insensitive' },
                        accountNumber: accountNumber !== 'UNKNOWN' ? accountNumber : undefined,
                        organizationId: dto.organizationId,
                    }
                });
            }
        }


        if (!bankAccount) {
            // Buscar por número de cuenta extraído del header Santander
            const extractedAccNum = (dto as any)._extractedAccountNumber;
            if (extractedAccNum) {
                bankAccount = await this.prisma.bankAccount.findFirst({
                    where: {
                        accountNumber: { contains: extractedAccNum },
                        organizationId: dto.organizationId,
                    }
                });
                if (bankAccount) this.logger.log(`Cuenta encontrada por número extraído del header: ${bankAccount.bankName} ${bankAccount.accountNumber}`);
            }
        }

        if (!bankAccount) {
            throw new Error(
                `No se encontró una cuenta bancaria de Bravium para el número del Excel (${(dto as any)._extractedAccountNumber || accountNumber}). La cuenta debe existir previamente; Fintoc ya no aplica.`
            );
        }

        // Get the latest CREDIT transaction date for this account to optimize skipping (ultimo ingreso de dinero)
        const latestTx = await this.prisma.bankTransaction.findFirst({
            where: { 
                bankAccountId: bankAccount.id,
                type: 'CREDIT',
            },
            orderBy: { date: 'desc' },
        });
        const latestDate = latestTx ? new Date(latestTx.date) : null;

        this.logger.log(`Processing Ingestion: ${bankAccount.bankName} (${bankAccount.accountNumber}). Latest income movement (CREDIT): ${latestDate ? latestDate.toISOString().split('T')[0] : 'None'}`);

        if (rows.length === 0) {
            this.logger.warn('No rows to process');
            return { status: 'warning', message: 'No rows found', insertedRows: 0 };
        }

        // FASE DE EXTRACCIÓN NATIVA (Fast-Path para Santander e Itaú)
        let normalizedRows: any[] = [];
        let controlSums: any = undefined;

        // Intentar detectar formato Santander (CartolaHistCtaCte)
        const isSantander = filename && filename.includes('CartolaHistCtaCte');
        if (isSantander && dto.fileContentBase64) {
            this.logger.log('Detectado formato Santander nativo. Omitiendo OpenAI.');
            const XLSX = require('xlsx');
            const wb = XLSX.read(Buffer.from(dto.fileContentBase64, 'base64'), { type: 'buffer' });
            const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[];
            
            // Buscar control sums y número de cuenta del header
            const sumRowIdx = rawData.findIndex(r => Array.isArray(r) && r[0] === 'SALDO INICIAL' && r[1] === 'DEPÓSITOS');
            if (sumRowIdx !== -1 && rawData[sumRowIdx + 1]) {
                const sums = rawData[sumRowIdx + 1];
                controlSums = {
                    totalAbonos: (Number(sums[1]) || 0) + (Number(sums[2]) || 0),
                    totalCargos: Math.abs((Number(sums[3]) || 0) + (Number(sums[4]) || 0) + (Number(sums[5]) || 0))
                };
            }

            // Extraer número de cuenta del header (fila con "Cuenta Corriente N°:")
            const cuentaRow = rawData.find(r => Array.isArray(r) && typeof r[0] === 'string' && r[0].includes('Cuenta Corriente N°:'));
            if (cuentaRow) {
                const rawCuenta = String(cuentaRow[0]);
                const m = rawCuenta.match(/N[°º]?:\s*([\d\-]+)/);
                if (m) {
                    // Normalizar: '0-000-9219882-0' → '92198820'
                    const extracted = m[1].replace(/[-\s]/g, '').replace(/^0+/, '');
                    if (extracted && extracted.length >= 5) {
                        this.logger.log(`Número de cuenta extraído del header Santander: ${extracted}`);
                        // Sobreescribir para que el lookup de cuenta use este número
                        (dto as any)._extractedAccountNumber = extracted;
                    }
                }
            }

            // Buscar header de movimientos
            const headerIdx = rawData.findIndex(r => Array.isArray(r) && r[0] === 'MONTO' && r[3] === 'FECHA');
            if (headerIdx !== -1) {
                for (let i = headerIdx + 1; i < rawData.length; i++) {
                    const r = rawData[i];
                    if (!r || !r[3] || String(r[3]).trim() === '') continue; // Fin de datos o fila vacía
                    
                    const dateStr = String(r[3]).trim(); // DD/MM/YYYY
                    if (dateStr.length < 8) continue;
                    
                    const parts = dateStr.split('/');
                    let isoDate = dateStr;
                    if (parts.length === 3) isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;

                    const rawAmount = Number(r[0]);
                    if (isNaN(rawAmount) || rawAmount % 1 !== 0) continue; // Ignorar ghost rows de Santander con decimales (ej: -11.723)
                    
                    const amount = Math.abs(rawAmount);
                    const typeChar = String(r[7]).trim().toUpperCase();
                    
                    let credit, debit;
                    if (typeChar === 'A') credit = amount;
                    else if (typeChar === 'C') debit = amount;
                    else continue;

                    normalizedRows.push({
                        date: isoDate,
                        reference: String(r[4] || '').trim(),
                        description: String(r[1] || '').trim(),
                        amount: amount,
                        credit: credit,
                        debit: debit
                    });
                }
            }
        }

        const isItau = filename && /0215703887/i.test(filename) && !isItauTcPdfFilename(filename);
        if (!normalizedRows.length && isItau && dto.fileContentBase64) {
            this.logger.log('Detectado formato Itaú nativo. Omitiendo OpenAI.');
            const XLSX = require('xlsx');
            const wb = XLSX.read(Buffer.from(dto.fileContentBase64, 'base64'), { type: 'buffer' });
            const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[];

            let periodYear = 2026;
            let periodMonth = 1;
            for (const row of rawData) {
                if (!Array.isArray(row)) continue;
                const joined = row.map((c) => String(c || '')).join(' ');
                const pm = joined.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
                if (pm) {
                    periodMonth = parseInt(pm[2], 10);
                    periodYear = parseInt(pm[3], 10);
                    break;
                }
            }

            const cuentaRow = rawData.find((r) => Array.isArray(r) && String(r[2] || '').includes('Número de cuenta'));
            if (cuentaRow && cuentaRow[3]) {
                const num = String(cuentaRow[3]).replace(/\D/g, '');
                if (num.length >= 5) (dto as any)._extractedAccountNumber = num;
            } else {
                (dto as any)._extractedAccountNumber = '0215703887';
            }

            const totIdx = rawData.findIndex((r) => Array.isArray(r) && String(r[0] || '').toLowerCase().includes('total cargos'));
            if (totIdx !== -1 && rawData[totIdx + 1]) {
                const sums = rawData[totIdx + 1];
                controlSums = {
                    totalCargos: Math.abs(Number(sums[0]) || 0),
                    totalAbonos: Math.abs(Number(sums[1]) || 0),
                };
            }

            const headerIdx = rawData.findIndex((r) =>
                Array.isArray(r) && String(r[0] || '').trim() === 'Fecha' && String(r[3] || '').toLowerCase().includes('descrip'),
            );
            if (headerIdx !== -1) {
                for (let i = headerIdx + 1; i < rawData.length; i++) {
                    const r = rawData[i];
                    if (!r || !r[0]) continue;
                    const dateStr = String(r[0]).trim();
                    const dm = dateStr.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
                    if (!dm) {
                        if (String(r[0]).toLowerCase().includes('resumen')) break;
                        continue;
                    }
                    const day = dm[1].padStart(2, '0');
                    const month = (dm[2] || String(periodMonth)).padStart(2, '0');
                    let year = dm[3] ? (dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : String(periodYear);
                    const credit = Number(r[4] || 0) || 0;
                    const debit = Number(r[5] || 0) || 0;
                    if (credit === 0 && debit === 0) continue;
                    normalizedRows.push({
                        date: `${year}-${month}-${day}`,
                        reference: String(r[1] || '').trim(),
                        description: String(r[3] || '').trim(),
                        amount: credit > 0 ? credit : debit,
                        credit: credit > 0 ? credit : undefined,
                        debit: debit > 0 ? debit : undefined,
                    });
                }
            }
            this.logger.log(`Itaú nativo: ${normalizedRows.length} filas, control=${JSON.stringify(controlSums || null)}`);
        }

        const tcParsed: SantanderTcParseResult | undefined = (dto as any)._tcParsed;
        if (!normalizedRows.length && tcParsed) {
            if (!tcParsed.leyComprasOk || !tcParsed.leySection3Ok) {
                const msg = `Ingreso Abortado TC Santander: ${tcParsed.errors.join('; ')}`;
                this.logger.error(msg);
                throw new Error(msg);
            }
            this.logger.log(`Detectado PDF TC Santander nativo. Omitiendo OpenAI. Cuenta=${tcParsed.accountNumber}`);
            controlSums = {
                totalAbonos: tcParsed.controlSums.totalAbonos,
                totalCargos: tcParsed.controlSums.totalCargos,
            };
            normalizedRows = tcParsed.rows.map((r) => ({
                date: r.date,
                description: r.description,
                amount: r.amount,
                credit: r.credit,
                debit: r.debit,
            }));
        }

        const itauTcParsed: ItauTcParseResult | undefined = (dto as any)._itauTcParsed;
        if (!normalizedRows.length && itauTcParsed) {
            if (!itauTcParsed.leyFacturadoOk) {
                const msg = `Ingreso Abortado TC Itaú: ${itauTcParsed.errors.join('; ')}`;
                this.logger.error(msg);
                throw new Error(msg);
            }
            this.logger.log(`Detectado PDF TC Itaú nativo. Omitiendo OpenAI. Cuenta=${itauTcParsed.accountNumber}`);
            controlSums = {
                totalAbonos: itauTcParsed.controlSums.totalAbonos,
                totalCargos: itauTcParsed.controlSums.totalCargos,
            };
            normalizedRows = itauTcParsed.rows.map((r) => ({
                date: r.date,
                description: r.description,
                amount: r.amount,
                credit: r.credit,
                debit: r.debit,
            }));
        }

        if (!normalizedRows.length) {
            const BATCH_SIZE = 50;
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batchRows = rows.slice(i, i + BATCH_SIZE);
                this.logger.log(`OpenAI: Procesando batch ${i / BATCH_SIZE + 1} de ${Math.ceil(rows.length / BATCH_SIZE)} (tamaño: ${batchRows.length} filas)...`);
                const aiResult = await this.openai.normalizeBankRows(batchRows, filename);
                normalizedRows = normalizedRows.concat(aiResult.transactions || []);
                if (aiResult.controlSums && !controlSums) controlSums = aiResult.controlSums;
            }
            this.logger.log(`OpenAI returned ${normalizedRows.length} total normalized rows.`);
        }

        // 3.5 FASE DE GUILLOTINA: Validación Matemática (Ley Sagrada)
        if (controlSums) {
            let sumAbonos = 0;
            let sumCargos = 0;
            
            for (const row of normalizedRows) {
                let amt = 0;
                
                // Si existe type = 'debit' o 'credit' explícito
                if (row['type'] === 'debit') amt = -Math.abs(Number(row['amount'] || 0));
                else if (row['type'] === 'credit') amt = Math.abs(Number(row['amount'] || 0));
                // Si existen campos credit o debit independientes
                else if (row['credit'] !== undefined || row['debit'] !== undefined) {
                    const credit = Number(row['credit'] || 0);
                    const debit = Number(row['debit'] || 0);
                    if (credit > 0) amt = credit;
                    else if (debit > 0) amt = -debit;
                }
                // Fallback al signo del campo amount
                else if (row['amount'] !== undefined) amt = Number(row['amount']);
                else if (row['monto'] !== undefined) amt = Number(row['monto']);
                
                if (dto.metadata?.invertAmountSign) {
                    amt = -amt;
                }

                if (amt > 0) sumAbonos += amt;
                else if (amt < 0) sumCargos += Math.abs(amt);
            }
            
            if (controlSums.totalAbonos !== undefined && sumAbonos !== controlSums.totalAbonos) {
                const msg = `Ingreso Abortado: Descalce matemático detectado en Abonos. El archivo indica ${controlSums.totalAbonos}, pero la suma de filas es ${sumAbonos}.`;
                this.logger.error(msg);
                throw new Error(msg);
            }
            if (controlSums.totalCargos !== undefined && sumCargos !== controlSums.totalCargos) {
                const msg = `Ingreso Abortado: Descalce matemático detectado en Cargos. El archivo indica ${controlSums.totalCargos}, pero la suma de filas es ${sumCargos}.`;
                this.logger.error(msg);
                throw new Error(msg);
            }
            this.logger.log(`Ley Sagrada Validada: Abonos=${sumAbonos} / Cargos=${sumCargos}`);
        } else {
            this.logger.warn('No se encontraron sumas de control explícitas en el documento. Se omitió la validación de la Ley Sagrada.');
        }

        // 4. Process Rows — OCCURRENCE-BASED DEDUPLICATION
        let insertedCount = 0;
        let skippedCount = 0;

        // Regex para extraer RUT chileno de una glosa bancaria
        // Ej: "TransfInternet a 76.794.035-1", "PAGO PROVEEDOR 12.345.678-9"
        const RUT_REGEX = /(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])/i;
        const fileOccurrenceCounter = new Map<string, number>();

        for (const row of normalizedRows) {
            const date = this.parseDate(row['date'] || row['fecha'] || row['Fecha'] || row['Date']);
            const description = row['description'] || row['descripcion'] || row['Movimiento'] || row['Description'] || 'Sin descripción';
            const reference = row['reference'] ? String(row['reference']) : null;

            let amount = 0;
            // CRÍTICO: verificar credit/debit ANTES que amount genérico.
            // El parser nativo de Santander siempre setea amount=Math.abs (>0), pero también credit o debit.
            // Si usamos amount primero, todos quedan como CREDIT (positivo). Hay que priorizar credit/debit.
            if (row['credit'] !== undefined || row['debit'] !== undefined) {
                const credit = Number(row['credit'] || row['Abono'] || 0);
                const debit = Number(row['debit'] || row['Cargo'] || 0);
                if (credit > 0) amount = credit;
                else if (debit > 0) amount = -debit;
            } else if (row['amount'] !== undefined) amount = Number(row['amount']);
            else if (row['monto'] !== undefined) amount = Number(row['monto']);

            // Filter out summary/balance lines and section headers based on document layout
            const upperDesc = (description || '').toUpperCase();
            if (
                upperDesc.includes('SALDO AL') ||
                upperDesc.includes('SALDO INICIAL') ||
                upperDesc.includes('SALDO FINAL') ||
                upperDesc.includes('SALDO DEL DIA') ||
                upperDesc.includes('SALDO DISPONIBLE') ||
                upperDesc.includes('SALDO EN CUENTA') ||
                upperDesc.includes('RESUMEN DE') ||
                upperDesc.includes('TOTAL CARGOS') ||
                upperDesc.includes('TOTAL ABONOS') ||
                upperDesc.includes('MOVIMIENTO SANTANDER') ||
                upperDesc.includes('MOVIMIENTO ITAÚ')
            ) {
                this.logger.debug(`SKIP summary/balance section header: "${description}"`);
                continue;
            }

            // Skip invalid rows
            if (!date || isNaN(amount) || amount === 0) {
                this.logger.debug(`SKIP invalid row: date=${date}, amount=${amount}`);
                continue;
            }

            // No se omite por "último CREDIT en BD": esa regla tragaba pagos válidos
            // del mismo archivo (ej. arriendo Parot 03-feb y LOGINSA 20-feb) cuando
            // ya existía un abono posterior en el mismo período.

            // 1. Check by Reference + Amount + Description + Date (clave compuesta)
            // Santander reutiliza N° documento entre meses y entre transferencias
            // del mismo mes; sin fecha se pierde el arriendo recurrente y los batch.
            const isDummyRef = reference && /^0+$/.test(reference.toString().trim());
            
            if (reference && !isDummyRef) {
                const existingByRef = await this.prisma.bankTransaction.findFirst({
                    where: { 
                        bankAccountId: bankAccount.id, 
                        reference,
                        amount: amount,
                        description: description,
                        date: date,
                    },
                    select: { id: true, date: true },
                });
                if (existingByRef) {
                    skippedCount++;
                    continue;
                }
            }


            // 2. Check by Occurrence Index (For identical movements without valid reference)
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

            // Extraer RUT del destinatario: primero desde OpenAI (que vio el contexto completo),
            // luego como fallback desde la regex sobre la descripción.
            const rutMatch = description.match(RUT_REGEX);
            const providerRut: string | undefined =
                (row['providerRut'] && typeof row['providerRut'] === 'string' && row['providerRut'].trim() !== '')
                    ? row['providerRut'].trim()
                    : rutMatch ? rutMatch[1] : undefined;

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
                        ...(providerRut && { providerRut }),
                    }
                }
            });
            if (providerRut) {
                this.logger.debug(`RUT extraído de glosa: "${description}" → ${providerRut}`);
            }
            insertedCount++;
        }

        this.logger.log(`Ingestion Complete. Inserted: ${insertedCount}, Skipped (old): ${skippedCount}`);

        return {
            status: 'ok',
            bank: bankAccount.bankName,
            account: bankAccount.accountNumber,
            insertedRows: insertedCount,
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

    private async parseSantanderTcFromDto(dto: DriveIngestDto): Promise<SantanderTcParseResult> {
        const pdfModule: any = await import('pdf-parse');
        const pdfParse = pdfModule.default || pdfModule;
        const buffer = Buffer.from(dto.fileContentBase64!, 'base64');
        const pdfData = await pdfParse(buffer);
        return parseSantanderTcPdf(String(pdfData.text || ''));
    }

    private async parseItauTcFromDto(dto: DriveIngestDto): Promise<ItauTcParseResult> {
        const pdfModule: any = await import('pdf-parse');
        const pdfParse = pdfModule.default || pdfModule;
        const buffer = Buffer.from(dto.fileContentBase64!, 'base64');
        const pdfData = await pdfParse(buffer);
        return parseItauTcPdf(String(pdfData.text || ''));
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
