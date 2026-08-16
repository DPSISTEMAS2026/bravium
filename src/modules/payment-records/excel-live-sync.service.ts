import { Injectable, Logger } from '@nestjs/common';
import * as xlsx from 'xlsx';
import * as fs from 'fs';

export interface ExcelPaymentRowInput {
    empresa: string;
    detalle?: string;
    tipoDocumento?: string;
    folioFactura?: string;
    folioBoleta?: string;
    monto: number;
    fechaPago: Date;
    medioPago?: string;
    comentario?: string;
    rut?: string;
    autorizacion?: string;
    linkCartola?: string;
    idMovimientoBanco?: string;
}

const PAGOS_CL_PATH = process.env.EXCEL_PAGOS_CL_PATH
    || 'e:\\BRAVIUM-PRODUCCION\\CARTOLAS\\EXCEL CARTOLAS 2026\\Pagos_CL_Plataforma_Identificados_2026.xlsx';
const CONTROL_PATH = process.env.EXCEL_CONTROL_PATH
    || 'e:\\BRAVIUM-PRODUCCION\\CARTOLAS\\EXCEL CARTOLAS 2026\\Control_Pagos_Bravium_Plataforma_2026.xlsx';

const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

const PAGOS_CL_HEADERS = [
    'Empresa',
    'Detalle',
    'Tipo Boleta/Factura',
    'Factura',
    'Boleta',
    'Valor',
    'Fecha de Pago',
    'Transferencia Banco / Tarjeta',
    'Comentario',
    'Autorización',
    'Revision',
    'Validacion',
];

@Injectable()
export class ExcelLiveSyncService {
    private readonly logger = new Logger(ExcelLiveSyncService.name);

    async appendPaymentToExcel(row: ExcelPaymentRowInput): Promise<boolean> {
        const r = await this.appendPaymentsToExcel([row]);
        return r.pagosCl || r.control;
    }

    async appendPaymentsToExcel(rows: ExcelPaymentRowInput[]): Promise<{ pagosCl: boolean; control: boolean }> {
        if (!rows.length) return { pagosCl: false, control: false };
        const pagosCl = this.appendToWorkbook(PAGOS_CL_PATH, rows, 'pagos-cl');
        const control = this.appendToWorkbook(CONTROL_PATH, rows, 'control');
        return { pagosCl, control };
    }

    private sheetNameFor(date: Date): string {
        return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    }

    private formatDate(d: Date): string {
        return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    }

    private normHeader(h: any): string {
        return String(h || '').replace(/\u00a0/g, ' ').trim().toLowerCase();
    }

    private appendToWorkbook(filePath: string, rows: ExcelPaymentRowInput[], kind: 'pagos-cl' | 'control'): boolean {
        try {
            // #region agent log
            try {
                fs.appendFileSync('e:\\BRAVIUM-PRODUCCION\\.cursor\\debug-58a0b5.log', JSON.stringify({
                    sessionId: '58a0b5', runId: 'retoma-dte-excel', hypothesisId: 'H1',
                    location: 'excel-live-sync.service.ts:appendToWorkbook',
                    message: 'excel write attempt',
                    data: { filePath, kind, rows: rows.length, exists: fs.existsSync(filePath), cwd: process.cwd(), platform: process.platform },
                    timestamp: Date.now(),
                }) + '\n');
            } catch { /* ignore */ }
            // #endregion
            if (!fs.existsSync(filePath)) {
                if (kind !== 'pagos-cl') {
                    this.logger.warn(`Excel no encontrado: ${filePath}`);
                    return false;
                }
                const wbNew = xlsx.utils.book_new();
                for (const m of MONTHS.slice(0, 8)) {
                    xlsx.utils.book_append_sheet(wbNew, xlsx.utils.aoa_to_sheet([PAGOS_CL_HEADERS]), `${m} 2026`);
                }
                xlsx.writeFile(wbNew, filePath);
                this.logger.log(`Excel plataforma creado: ${filePath}`);
            }

            const wb = xlsx.readFile(filePath);
            const bySheet = new Map<string, ExcelPaymentRowInput[]>();
            for (const row of rows) {
                const name = this.sheetNameFor(row.fechaPago);
                if (!bySheet.has(name)) bySheet.set(name, []);
                bySheet.get(name)!.push(row);
            }

            for (const [sheetName, sheetRows] of bySheet) {
                let sheet = wb.Sheets[sheetName];
                if (!sheet) {
                    sheet = xlsx.utils.aoa_to_sheet([PAGOS_CL_HEADERS]);
                    xlsx.utils.book_append_sheet(wb, sheet, sheetName);
                }

                const aoaHeader: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', range: 0 }) as any[][];
                const headers = (aoaHeader[0] && aoaHeader[0].length ? aoaHeader[0] : PAGOS_CL_HEADERS).map((h) => String(h ?? ''));
                const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1');
                let nextRow = range.e.r + 1;

                for (const row of sheetRows) {
                    const formattedDate = this.formatDate(row.fechaPago);
                    const values: Record<string, any> = {
                        empresa: row.empresa.trim(),
                        detalle: row.detalle?.trim() || 'Pago declarado en plataforma',
                        tipo: row.tipoDocumento || 'Factura',
                        factura: row.folioFactura ? (parseInt(row.folioFactura, 10) || row.folioFactura) : '',
                        boleta: row.folioBoleta || '',
                        valor: Math.round(row.monto),
                        fecha: formattedDate,
                        medio: row.medioPago || 'TRANSFERENCIA CUENTA SANTANDER',
                        comentario: row.comentario?.trim() || 'Declarado en Libro de Pagos',
                        autorizacion: row.autorizacion || 'PENDIENTE_CARTOLA',
                        revision: Math.round(row.monto),
                        validacion: row.idMovimientoBanco ? 'TRUE' : '',
                    };

                    headers.forEach((h, c) => {
                        const key = this.normHeader(h);
                        let v: any = '';
                        if (key === 'empresa' || key === 'item' || key === 'proveedor') v = values.empresa;
                        else if (key === 'detalle') v = values.detalle;
                        else if (key.includes('tipo')) v = values.tipo;
                        else if (key === 'factura') v = values.factura;
                        else if (key.startsWith('boleta')) v = values.boleta;
                        else if (key === 'valor') v = values.valor;
                        else if (key.includes('fecha')) v = values.fecha;
                        else if (key.includes('transferencia') || key.includes('medio')) v = values.medio;
                        else if (key === 'comentario' || key === 'observacion') v = values.comentario;
                        else if (key.startsWith('autoriz')) v = values.autorizacion;
                        else if (key === 'revision') v = values.revision;
                        else if (key.startsWith('validacion')) v = values.validacion;
                        else if (key === 'rut') v = row.rut || '';
                        else if (kind === 'control' && key.includes('estado')) v = row.idMovimientoBanco ? 'DOBLE VERIFICADO' : 'PENDIENTE_CARTOLA_VIERNES';
                        else if (kind === 'control' && key.includes('id_movimiento')) v = row.idMovimientoBanco || 'PENDIENTE_VIERNES';
                        else if (kind === 'control' && key.includes('link')) v = row.linkCartola || `http://localhost:3001/cartolas?folio=${row.folioFactura || ''}`;
                        if (v === '' || v === undefined) return;
                        const cell = xlsx.utils.encode_cell({ r: nextRow, c });
                        sheet[cell] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v: String(v) };
                    });
                    nextRow++;
                }

                sheet['!ref'] = xlsx.utils.encode_range({
                    s: range.s,
                    e: { r: Math.max(range.e.r, nextRow - 1), c: Math.max(range.e.c, headers.length - 1) },
                });
                wb.Sheets[sheetName] = sheet;
            }

            xlsx.writeFile(wb, filePath);
            this.logger.log(`Excel ${kind} actualizado (${rows.length} filas): ${filePath}`);
            // #region agent log
            try {
                fs.appendFileSync('e:\\BRAVIUM-PRODUCCION\\.cursor\\debug-58a0b5.log', JSON.stringify({
                    sessionId: '58a0b5', runId: 'retoma-dte-excel', hypothesisId: 'H1',
                    location: 'excel-live-sync.service.ts:appendToWorkbook:ok',
                    message: 'excel write ok',
                    data: { filePath, kind, rows: rows.length },
                    timestamp: Date.now(),
                }) + '\n');
            } catch { /* ignore */ }
            // #endregion
            return true;
        } catch (err: any) {
            this.logger.error(`No se pudo escribir ${kind} (${filePath}): ${err.message}`);
            // #region agent log
            try {
                fs.appendFileSync('e:\\BRAVIUM-PRODUCCION\\.cursor\\debug-58a0b5.log', JSON.stringify({
                    sessionId: '58a0b5', runId: 'retoma-dte-excel', hypothesisId: 'H1',
                    location: 'excel-live-sync.service.ts:appendToWorkbook:err',
                    message: 'excel write failed',
                    data: { filePath, kind, error: err.message },
                    timestamp: Date.now(),
                }) + '\n');
            } catch { /* ignore */ }
            // #endregion
            return false;
        }
    }
}
