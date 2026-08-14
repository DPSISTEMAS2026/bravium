/**
 * Parser nativo de estado de cuenta Tarjeta de Crédito Santander (CLP).
 * Totales de control salen del PDF (Ley Sagrada): no se inventan sumando filas.
 */

export type SantanderTcKind = 'compra' | 'nc' | 'comision' | 'cancelado' | 'otro_abono' | 'otro_cargo';

export interface SantanderTcRow {
    date: string; // YYYY-MM-DD
    description: string;
    location: string;
    amount: number; // valor absoluto
    credit?: number;
    debit?: number;
    kind: SantanderTcKind;
    rawAmount: string;
}

export interface SantanderTcParseResult {
    accountLast4: string | null;
    accountNumber: string | null;
    totalOperaciones: number | null;
    section3Net: number | null;
    rows: SantanderTcRow[];
    skippedCancelados: number;
    sumCompras: number;
    sumAbonos: number;
    sumOtrosCargos: number;
    leyComprasOk: boolean;
    leySection3Ok: boolean;
    controlSums: { totalAbonos: number; totalCargos: number };
    errors: string[];
}

const MOVE_RE = /^(\d{2}\/\d{2}\/\d{2})([^$]*)\$\s*(-?(?:\d{1,3}(?:\.\d{3})+|\d+))(.*)$/;
const CUOTA_RE = /^(\d{2}\/\d{2}\/\d{2})\$.*?N\/CUOTAS PRECIO\$\s*([\d.]+)(\d{2}\/\d{2})(.*)$/i;

export function isSantanderTcPdfFilename(filename?: string): boolean {
    if (!filename) return false;
    const u = filename.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (u.includes('USD')) return false;
    if (u.includes('ITAU')) return false;
    if (/STDR\s*TC/.test(u)) return true;
    if (/ESTADO\s+(DE\s+)?CUENTA\s+TC/.test(u)) return true;
    if (u.includes('ESTADOCUENTATC')) return true;
    return false;
}

export function parseClpAmount(raw: string): number | null {
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

function toIsoDate(ddmmyy: string): string | null {
    const m = ddmmyy.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (!m) return null;
    const day = m[1];
    const month = m[2];
    const year = `20${m[3]}`;
    return `${year}-${month}-${day}`;
}

function classify(description: string, signed: number): SantanderTcKind {
    const u = description.toUpperCase();
    if (u.includes('MONTO CANCELADO')) return 'cancelado';
    if (u.includes('NOTA DE CREDITO') || u.includes('NOTA DE CRÉDITO')) return 'nc';
    if (u.includes('COMISION') || u.includes('COMISIÓN')) return 'comision';
    if (
        u.includes('INTERESES') ||
        u.includes('IMPUESTOS') ||
        u.includes('IVA USO') ||
        u.includes('SERVICIO COMPRA')
    ) return 'otro_cargo';
    if (u.includes('PREPAGO EN CUOTAS')) return 'otro_cargo';
    if (u.includes('PAGO PROVISORIO')) return 'otro_abono';
    if (signed < 0) return 'otro_abono';
    return 'compra';
}

function parseMoveLine(line: string): Omit<SantanderTcRow, 'kind'> & { signed: number } | null {
    const cuota = line.match(CUOTA_RE);
    if (cuota) {
        const monthly = parseClpAmount(cuota[2]);
        const iso = toIsoDate(cuota[1]);
        if (monthly === null || monthly === 0 || !iso) return null;
        return {
            date: iso,
            description: `${(cuota[4] || '').trim()} (cuota ${cuota[3]})`.trim(),
            location: '',
            amount: Math.abs(monthly),
            rawAmount: cuota[2],
            signed: monthly,
        };
    }
    const match = line.match(MOVE_RE);
    if (!match) return null;
    const signed = parseClpAmount(match[3]);
    const iso = toIsoDate(match[1]);
    if (signed === null || signed === 0 || !iso) return null;
    return {
        date: iso,
        description: (match[4] || '').trim() || 'Sin descripción',
        location: (match[2] || '').trim(),
        amount: Math.abs(signed),
        rawAmount: match[3],
        signed,
    };
}

function dropOppositePairs(rows: SantanderTcRow[]): SantanderTcRow[] {
    const used = new Set<number>();
    for (let i = 0; i < rows.length; i++) {
        if (used.has(i)) continue;
        for (let j = i + 1; j < rows.length; j++) {
            if (used.has(j)) continue;
            const a = rows[i];
            const b = rows[j];
            if (a.date !== b.date || a.amount !== b.amount) continue;
            if (a.description !== b.description) continue;
            const aAbono = !!a.credit;
            const bAbono = !!b.credit;
            if (aAbono === bAbono) continue;
            used.add(i);
            used.add(j);
            break;
        }
    }
    return rows.filter((_, idx) => !used.has(idx));
}

export function parseSantanderTcPdf(text: string): SantanderTcParseResult {
    const errors: string[] = [];
    const accountMatch = text.match(/XXXX[\sX-]*(\d{4})/i);
    const accountLast4 = accountMatch ? accountMatch[1] : null;
    const accountNumber = accountLast4 ? `XXXX-${accountLast4}` : null;

    const totalOpMatch = text.match(/1\.\s*TOTAL OPERACIONES\s*\$\s*(-?[\d.]+)/i);
    const totalOperaciones = totalOpMatch ? parseClpAmount(totalOpMatch[1]) : null;
    if (totalOperaciones === null) errors.push('No se encontró TOTAL OPERACIONES en el PDF');

    const sec3Match = text.match(/3\.\s*CARGOS,\s*COMISIONES,\s*IMPUESTOS Y ABONOS\s*\$\s*(-?[\d.]+)/i);
    const section3Net = sec3Match ? parseClpAmount(sec3Match[1]) : null;
    if (section3Net === null) errors.push('No se encontró CARGOS, COMISIONES, IMPUESTOS Y ABONOS en el PDF');

    let rows: SantanderTcRow[] = [];
    let skippedCancelados = 0;
    const rejected: string[] = [];

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const parsed = parseMoveLine(line);
        if (!parsed) {
            if (/^\d{2}\/\d{2}\/\d{2}/.test(line) && line.includes('$')) rejected.push(line.slice(0, 140));
            continue;
        }
        const kind = classify(parsed.description, parsed.signed);
        if (kind === 'cancelado') {
            skippedCancelados++;
            continue;
        }
        const isAbono = kind === 'nc' || kind === 'otro_abono';
        rows.push({
            date: parsed.date,
            description: parsed.description,
            location: parsed.location,
            amount: parsed.amount,
            credit: isAbono ? parsed.amount : undefined,
            debit: isAbono ? undefined : parsed.amount,
            kind,
            rawAmount: parsed.rawAmount,
        });
    }

    rows = dropOppositePairs(rows);

    const sumCompras = rows.filter((r) => r.kind === 'compra').reduce((s, r) => s + r.amount, 0);
    const sumAbonos = rows.filter((r) => r.kind === 'nc' || r.kind === 'otro_abono').reduce((s, r) => s + r.amount, 0);
    const sumOtrosCargos = rows.filter((r) => r.kind === 'comision' || r.kind === 'otro_cargo').reduce((s, r) => s + r.amount, 0);
    const section3Signed = rows
        .filter((r) => r.kind === 'nc' || r.kind === 'comision' || r.kind === 'otro_abono' || r.kind === 'otro_cargo')
        .reduce((s, r) => s + (r.credit ? -r.credit : r.debit || 0), 0);

    const leyComprasOk = totalOperaciones !== null && sumCompras === totalOperaciones;
    const leySection3Ok = section3Net !== null && section3Signed === section3Net;

    if (!leyComprasOk) {
        errors.push(
            `Descalce TOTAL OPERACIONES: PDF=${totalOperaciones} suma compras=${sumCompras} diff=${(sumCompras - (totalOperaciones || 0))}`,
        );
    }
    if (!leySection3Ok) {
        errors.push(
            `Descalce sección 3: PDF=${section3Net} suma firmada=${section3Signed} diff=${(section3Signed - (section3Net || 0))}`,
        );
    }
    if (rejected.length && (!leyComprasOk || !leySection3Ok)) {
        errors.push(`Líneas con monto ilegible: ${rejected.length}`);
    }

    return {
        accountLast4,
        accountNumber,
        totalOperaciones,
        section3Net,
        rows,
        skippedCancelados,
        sumCompras,
        sumAbonos,
        sumOtrosCargos,
        leyComprasOk,
        leySection3Ok,
        controlSums: {
            totalAbonos: sumAbonos,
            totalCargos: (totalOperaciones || 0) + sumOtrosCargos,
        },
        errors,
    };
}
