/**
 * Parser nativo de estado de cuenta Tarjeta de Crédito Itaú (CLP, xxxx-3965).
 * Ley Sagrada: Monto total facturado a pagar (sección III) = suma de filas ingeridas
 * (se omite Monto Cancelado: es el pago a la tarjeta, ya está en Cta Cte).
 */

export type ItauTcKind = 'compra' | 'nc' | 'comision' | 'cancelado' | 'otro_abono' | 'otro_cargo';

export interface ItauTcRow {
    date: string;
    description: string;
    location: string;
    amount: number;
    credit?: number;
    debit?: number;
    kind: ItauTcKind;
    rawAmount: string;
}

export interface ItauTcParseResult {
    accountLast4: string | null;
    accountNumber: string | null;
    montoFacturado: number | null;
    rows: ItauTcRow[];
    skippedCancelados: number;
    sumCompras: number;
    sumAbonos: number;
    sumOtrosCargos: number;
    leyFacturadoOk: boolean;
    controlSums: { totalAbonos: number; totalCargos: number };
    errors: string[];
}

export function isItauTcPdfFilename(filename?: string): boolean {
    if (!filename) return false;
    const u = filename.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (u.includes('USD')) return false;
    if (!u.includes('ITAU')) return false;
    return /\bTC\b/.test(u) || u.includes('TARJETA') || /ESTADO\s+(DE\s+)?CUENTA/.test(u);
}

export function parseClpAmountItau(raw: string): number | null {
    const cleaned = String(raw).replace(/\s/g, '');
    const neg = cleaned.startsWith('-');
    const body = cleaned.replace(/^-/, '');
    if (!body || !/^[\d.]+$/.test(body)) return null;
    const parts = body.split('.');
    if (parts.length === 1) {
        const n = Number(parts[0]);
        return Number.isFinite(n) ? (neg ? -n : n) : null;
    }
    if (parts[0].length < 1 || parts[0].length > 3) return null;
    if (parts.slice(1).some((p) => p.length !== 3)) return null;
    const n = Number(parts.join(''));
    return Number.isFinite(n) ? (neg ? -n : n) : null;
}

function toIsoDate(ddmmyyyy: string): string | null {
    const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
}

function classify(description: string, signed: number): ItauTcKind {
    const u = description.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (u.includes('MONTO CANCELADO')) return 'cancelado';
    if (u.includes('NOTA DE CREDITO')) return 'nc';
    if (u.includes('COMISION')) return 'comision';
    if (
        u.includes('INTERESES') ||
        u.includes('IMPUESTO') ||
        u.includes('TRASPASO DEUDA') ||
        u.includes('IVA')
    ) return 'otro_cargo';
    if (signed < 0) return 'otro_abono';
    return 'compra';
}

const AMT = String.raw`(-?(?:\d{1,3}(?:\.\d{3})+|\d+?))`;
const MOVE_RE = new RegExp(
    String.raw`(?:([A-Za-zÁÉÍÓÚÑáéíóúñüÜ. ]+?))?(\d{2}/\d{2}/\d{4})(\d{14,})(.*?)\$\s*${AMT}\s*\$\s*${AMT}(\d{2}/\d{1,2})\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+))`,
    'g',
);

export function parseItauTcPdf(text: string): ItauTcParseResult {
    const errors: string[] = [];
    const accountMatch = text.match(/xxxx[\s-]*xxxx[\s-]*xxxx[\s-]*(\d{4})/i)
        || text.match(/N[º°o]?\s*de tarjeta[^\d]*(\d{4})/i);
    const accountLast4 = accountMatch ? accountMatch[1] : null;
    const accountNumber = accountLast4 ? `XXXX-${accountLast4}` : null;

    const start = text.search(/1\.\s*Total operaciones/i);
    const end = text.search(/III\.\s*Informaci[oó]n de pago/i);
    if (start < 0) errors.push('No se encontró sección 1.Total operaciones');
    if (end < 0) errors.push('No se encontró III. Información de pago');

    const pagoBlock = end >= 0 ? text.slice(end) : text;
    const facturadoMatch = pagoBlock.match(/Monto total facturado a pagar\s*\$\s*([\d.]+)/i);
    const montoFacturado = facturadoMatch ? parseClpAmountItau(facturadoMatch[1]) : null;
    if (montoFacturado === null) errors.push('No se encontró Monto total facturado a pagar');

    const block = start >= 0 && end > start
        ? text.slice(start, end).replace(/\s+/g, ' ')
        : '';

    const rows: ItauTcRow[] = [];
    let skippedCancelados = 0;
    MOVE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MOVE_RE.exec(block)) !== null) {
        const iso = toIsoDate(m[2]);
        const cargoMes = parseClpAmountItau(m[8]);
        const signedOp = parseClpAmountItau(m[5]);
        if (!iso || cargoMes === null || cargoMes === 0) continue;
        const location = (m[1] || '').trim();
        const description = (m[4] || '').replace(/\s+/g, ' ').trim() || 'Sin descripción';
        const signed = signedOp !== null ? Math.sign(signedOp) * Math.abs(cargoMes) : cargoMes;
        const kind = classify(description, signed);
        if (kind === 'cancelado') {
            skippedCancelados++;
            continue;
        }
        const isAbono = kind === 'nc' || kind === 'otro_abono';
        rows.push({
            date: iso,
            description,
            location,
            amount: Math.abs(cargoMes),
            credit: isAbono ? Math.abs(cargoMes) : undefined,
            debit: isAbono ? undefined : Math.abs(cargoMes),
            kind,
            rawAmount: m[8],
        });
    }

    const sumCompras = rows.filter((r) => r.kind === 'compra').reduce((s, r) => s + r.amount, 0);
    const sumAbonos = rows.filter((r) => r.kind === 'nc' || r.kind === 'otro_abono').reduce((s, r) => s + r.amount, 0);
    const sumOtrosCargos = rows.filter((r) => r.kind === 'comision' || r.kind === 'otro_cargo').reduce((s, r) => s + r.amount, 0);
    const netIngested = sumCompras + sumOtrosCargos - sumAbonos;
    const leyFacturadoOk = montoFacturado !== null && netIngested === montoFacturado;
    if (!leyFacturadoOk) {
        errors.push(
            `Descalce MONTO FACTURADO: PDF=${montoFacturado} suma filas=${netIngested} (compras=${sumCompras} otros=${sumOtrosCargos} abonos=${sumAbonos})`,
        );
    }

    return {
        accountLast4,
        accountNumber,
        montoFacturado,
        rows,
        skippedCancelados,
        sumCompras,
        sumAbonos,
        sumOtrosCargos,
        leyFacturadoOk,
        controlSums: {
            totalAbonos: sumAbonos,
            totalCargos: sumCompras + sumOtrosCargos,
        },
        errors,
    };
}
