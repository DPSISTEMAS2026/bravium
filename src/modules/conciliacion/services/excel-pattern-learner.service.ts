import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TransactionStatus } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Patrón aprendido del cruce entre el Excel de Pagos y las transacciones bancarias.
 * Ej: la categoría "Pago TC Santander" del Excel cruza con la glosa bancaria
 * "Traspaso Internet a T. Crédito" → se genera una AutoCategoryRule.
 */
export interface ExcelPattern {
    /** Keyword normalizado de la glosa bancaria (ej. "traspaso internet t credito") */
    glosaBancariaKeyword: string;
    /** Glosa bancaria original completa (ej. "Traspaso Internet a T. Crédito") */
    glosaBancariaOriginal: string;
    /** Nombre de categoría del Excel (ej. "Pago TC Santander") */
    categoriaExcel: string;
    /** Monto de ejemplo de una coincidencia */
    montoEjemplo: number;
    /** Cuántos meses se detectó la misma pareja (glosa ↔ categoría) */
    mesesDetectados: number;
    /** Confianza 0-1 basada en la repetición */
    confianza: number;
}

/**
 * Resultado del proceso de aprendizaje del Excel de Pagos.
 */
export interface LearningResult {
    /** Total de filas procesadas en el Excel */
    totalFilasExcel: number;
    /** Cruces exitosos (fila Excel ↔ transacción bancaria) */
    crucesExitosos: number;
    /** Patrones únicos detectados */
    patronesUnicos: number;
    /** Reglas creadas en AutoCategoryRule */
    reglasCreadas: number;
    /** Reglas que ya existían (skipped) */
    reglasExistentes: number;
    /** Detalle de patrones encontrados */
    patrones: ExcelPattern[];
    anotadasAhora: number;
    omitidasPorDte: number;
    omitidasAmbiguas: number;
    sinCartola: number;
    glosasPropagadas: number;
}

// Columnas del Excel de Pagos que contienen la categoría/empresa
const EXCEL_EMPRESA_COLS = ['Empresa', 'Item'];
// Columna del monto
const EXCEL_MONTO_COL = 'Valor';
// Columna de medio de pago (para filtrar solo transferencias bancarias)
const EXCEL_FECHA_COL = 'Fecha de Pago';
const GLOSA_DEMASIADO_GENERICA = new Set([
    'transf', 'transferencia', 'pago', 'abono', 'cargo', 'compra',
    'transf internet', 'transferencia internet',
]);

function isGlosaMemorySafe(norm: string): boolean {
    if (!norm || norm.length < 8) return false;
    if (GLOSA_DEMASIADO_GENERICA.has(norm)) return false;
    if (/^(transf|transferencia)( internet)?$/.test(norm)) return false;
    return true;
}

/** MP/Webpay/DP: el comercio se repite, el ítem del Excel cambia cada mes. */
export function isMarketplaceGlosa(desc: string): boolean {
    return /^(MP\s*\*|MERCADOPAGO|WEBPAY|DP\s*\*)/i.test((desc || '').trim());
}

/** Amazon/MP/Webpay: el comercio se repite, el ítem del Excel cambia (gift card un mes, servicios otro). */
export function isVariableCommerceGlosa(desc: string): boolean {
    if (isMarketplaceGlosa(desc)) return true;
    const s = (desc || '').replace(/\s+/g, ' ').trim();
    return /^AMAZON(\.COM)?(\b|$)/i.test(s) || /^AMAZON\s*(MKTP|MARKETPLACE)/i.test(s);
}

export function extractCommerceFromGlosa(desc: string): string | null {
    const s = (desc || '').replace(/\s+/g, ' ').trim();
    const mp = s.match(/^MP\s*\*\s*(.+)$/i);
    if (mp?.[1]) return toTitle(mp[1]);
    const mero = s.match(/^MERCADOPAGO\s*\*?\s*(.+)$/i);
    if (mero?.[1]) return toTitle(mero[1]);
    const wp = s.match(/^WEBPAY(?:PLUS)?\s+(.+)$/i);
    if (wp?.[1]) return toTitle(wp[1]);
    const dp = s.match(/^DP\s*\*\s*(.+)$/i);
    if (dp?.[1]) return toTitle(dp[1].replace(/\.com$/i, ''));
    if (/^AMAZON(\.COM)?(\b|$)/i.test(s) || /^AMAZON\s*(MKTP|MARKETPLACE)/i.test(s)) return 'Amazon';
    return null;
}

function toTitle(raw: string): string {
    return raw
        .replace(/[._*]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Gastos que no tienen DTE: el Excel los explica y se pueden cerrar como IDENTIFICADO.
 * El resto (proveedores) se identifica con el nombre del Excel pero sigue PENDING
 * para no saltarse un calce 1:1 con factura.
 */
export const CATEGORIAS_GASTO_FIJO = [
    'pago tc',
    'impuesto',
    'remuneracion',
    'sueldo',
    'previred',
    'leyes sociales',
    'compra dolar',
    'compra divisa',
    'arriendo',
    'gasto comun',
    'honorario',
    'comision',
    'seguro',
    'mantencion',
    'aguinaldo',
    'bono',
    'finiquito',
    'cotizacion',
    'afc',
    'isapre',
    'fonasa',
    'patente',
    'contribucion',
    'permiso',
    'municipal',
    'tesoreria',
    'sii',
    'iva',
    'ppm',
    'notario',
    'conservador',
];

export function isExcelGastoFijo(empresa: string): boolean {
    const n = (empresa || '').toLowerCase();
    return CATEGORIAS_GASTO_FIJO.some((cat) => n.includes(cat));
}

/**
 * Servicio que lee el Excel de Pagos ("Pagos CL 2026.xlsx") y aprende patrones
 * de clasificación cruzando los montos con las transacciones bancarias.
 *
 * El resultado son AutoCategoryRules que permiten clasificar automáticamente
 * movimientos recurrentes que no tienen DTE (ej. pagos de TC, impuestos, sueldos).
 */
@Injectable()
export class ExcelPatternLearnerService {
    private readonly logger = new Logger(ExcelPatternLearnerService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * 1. El motor DTE 1:1 corre antes.
     * 2. Cada fila del Excel se cruza con un cargo de cartola del mismo mes y mismo monto.
     *    Si el monto no es único, se usa la fecha (±3 días).
     * 3. Si ese cargo YA tiene DTE, no se aprende (la factura ya lo explica).
     * 4. Si no hay DTE, se identifica con el nombre del Excel y se memoriza la glosa
     *    para el próximo mes.
     */
    async learnFromExcel(
        organizationId: string,
        excelPath?: string,
    ): Promise<LearningResult> {
        const filePath = excelPath || this.getDefaultExcelPath();

        if (!fs.existsSync(filePath)) {
            throw new Error(`Excel de Pagos no encontrado en: ${filePath}`);
        }

        this.logger.log(`Iniciando aprendizaje desde: ${filePath}`);

        const XLSX = require('xlsx');
        const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });

        const monthSheets = wb.SheetNames.filter((name: string) =>
            /^(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+\d{4}$/i.test(name)
        );

        this.logger.log(`Hojas mensuales encontradas: ${monthSheets.join(', ')}`);

        let totalFilasExcel = 0;
        let crucesExitosos = 0;
        let anotadasAhora = 0;
        let omitidasPorDte = 0;
        let omitidasAmbiguas = 0;
        let sinCartola = 0;

        const patternMap = new Map<string, {
            glosaBancariaOriginal: string;
            votos: Map<string, number>;
            montoEjemplo: number;
            meses: Set<string>;
        }>();

        for (const sheetName of monthSheets) {
            const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]) as any[];
            const monthRange = this.parseMonthRange(sheetName);
            if (!monthRange) continue;

            const { from, to } = monthRange;
            const monthTxs = await this.prisma.bankTransaction.findMany({
                where: {
                    bankAccount: { organizationId },
                    type: 'DEBIT',
                    date: { gte: from, lte: to },
                },
                select: {
                    id: true,
                    description: true,
                    amount: true,
                    date: true,
                    status: true,
                    metadata: true,
                    matches: {
                        where: { status: { in: ['CONFIRMED', 'DRAFT'] } },
                        select: { id: true },
                    },
                },
            });

            const byAmount = new Map<number, typeof monthTxs>();
            for (const tx of monthTxs) {
                const abs = Math.abs(Number(tx.amount));
                const list = byAmount.get(abs) || [];
                list.push(tx);
                byAmount.set(abs, list);
            }

            const usedTx = new Set<string>();

            for (const row of data) {
                const empresa = this.extractEmpresa(row);
                const valor = Number(row[EXCEL_MONTO_COL]);
                if (!empresa || !valor || valor <= 0) continue;
                totalFilasExcel++;

                const excelDate = this.parseExcelDate(row[EXCEL_FECHA_COL]);
                const tipoDoc = this.extractField(row, ['tipo boleta/factura']);
                const folioBoleta = this.extractField(row, ['boleta']);
                const folioFactura = this.extractField(row, ['factura']);
                let picked = this.pickUniqueTx(byAmount.get(valor) || [], usedTx, excelDate, empresa);
                if (!picked || picked === 'ambiguous') {
                    const near = monthTxs.filter((t) => {
                        const diff = Math.abs(Math.abs(Number(t.amount)) - valor);
                        return diff > 0 && diff <= 200 && !usedTx.has(t.id);
                    });
                    if (near.length) {
                        const nearPick = this.pickUniqueTx(near, usedTx, excelDate, empresa);
                        if (nearPick && nearPick !== 'ambiguous') picked = nearPick;
                    }
                }
                if (picked === 'ambiguous') {
                    omitidasAmbiguas++;
                    continue;
                }
                if (!picked || !picked.description) {
                    sinCartola++;
                    continue;
                }

                usedTx.add(picked.id);
                if (picked.matches.length > 0) {
                    omitidasPorDte++;
                    continue;
                }

                const honorarios = /boleta|honorario/i.test(`${tipoDoc} ${empresa} ${this.extractField(row, ['detalle'])}`);
                if (picked.status === TransactionStatus.PENDING) {
                    await this.annotateFromExcel(picked.id, picked.metadata, empresa, picked.description, {
                        tipoDocumento: tipoDoc || undefined,
                        folioBoleta: folioBoleta || undefined,
                        folioFactura: folioFactura || undefined,
                        honorarios,
                    });
                    anotadasAhora++;
                }

                const glosaNorm = this.normalizeGlosa(picked.description);
                if (!glosaNorm || !isGlosaMemorySafe(glosaNorm) || isVariableCommerceGlosa(picked.description)) {
                    crucesExitosos++;
                    continue;
                }

                crucesExitosos++;
                const existing = patternMap.get(glosaNorm);
                if (existing) {
                    existing.meses.add(sheetName);
                    existing.votos.set(empresa, (existing.votos.get(empresa) || 0) + 1);
                } else {
                    patternMap.set(glosaNorm, {
                        glosaBancariaOriginal: picked.description,
                        votos: new Map([[empresa, 1]]),
                        montoEjemplo: valor,
                        meses: new Set([sheetName]),
                    });
                }
            }
        }

        // Convertir a patrones con confianza
        const patrones: ExcelPattern[] = [];
        for (const [keyword, data] of patternMap) {
            const ranked = [...data.votos.entries()].sort((a, b) => b[1] - a[1]);
            const categoriaExcel = ranked[0][0];
            patrones.push({
                glosaBancariaKeyword: keyword,
                glosaBancariaOriginal: data.glosaBancariaOriginal,
                categoriaExcel,
                montoEjemplo: data.montoEjemplo,
                mesesDetectados: data.meses.size,
                confianza: Math.min(1, data.meses.size / 3),
            });
        }

        // Ordenar por confianza descendente
        patrones.sort((a, b) => b.confianza - a.confianza);

        this.logger.log(
            `Aprendizaje completado: ${totalFilasExcel} filas Excel, ` +
            `${crucesExitosos} cruces, ${patrones.length} patrones, ` +
            `anotadas=${anotadasAhora} dte=${omitidasPorDte} ambiguas=${omitidasAmbiguas} sinCartola=${sinCartola}`,
        );

        // Crear AutoCategoryRules para patrones detectados (≥1 mes)
        const { created, skipped } = await this.createRulesFromPatterns(
            organizationId,
            patrones.filter(p => p.mesesDetectados >= 1 && !isVariableCommerceGlosa(p.glosaBancariaOriginal)),
        );

        const glosasPropagadas = await this.applyGlosaMemory(organizationId, patrones);

        return {
            totalFilasExcel,
            crucesExitosos,
            patronesUnicos: patrones.length,
            reglasCreadas: created,
            reglasExistentes: skipped,
            patrones,
            anotadasAhora,
            omitidasPorDte,
            omitidasAmbiguas,
            sinCartola,
            glosasPropagadas,
        };
    }

    /**
     * Una vez aprendida una glosa (ej. MP *RELANI → KANO), se aplica a todos
     * los cargos pendientes de cualquier mes que no tengan DTE.
     */
    private async applyGlosaMemory(
        organizationId: string,
        patrones: ExcelPattern[],
    ): Promise<number> {
        if (!patrones.length) return 0;
        const byNorm = new Map(patrones.map((p) => [p.glosaBancariaKeyword, p]));
        const txs = await this.prisma.bankTransaction.findMany({
            where: {
                bankAccount: { organizationId },
                type: 'DEBIT',
            },
            select: {
                id: true,
                description: true,
                status: true,
                metadata: true,
                matches: {
                    where: { status: { in: ['CONFIRMED', 'DRAFT'] } },
                    select: { id: true },
                },
            },
        });

        let updated = 0;
        const relaniSamples: any[] = [];
        for (const tx of txs) {
            if (tx.matches.length > 0) continue;
            const norm = this.normalizeGlosa(tx.description || '');
            if (!isGlosaMemorySafe(norm)) continue;
            const pattern = byNorm.get(norm);
            if (!pattern) continue;
            if (isVariableCommerceGlosa(tx.description || '')) continue;
            const meta = typeof tx.metadata === 'object' && tx.metadata ? tx.metadata as any : {};
            if (meta.category === pattern.categoriaExcel && meta.autoCategorized) continue;
            await this.annotateFromExcel(tx.id, meta, pattern.categoriaExcel, tx.description);
            updated++;
            if (/relani|kano/i.test(`${tx.description} ${pattern.categoriaExcel}`)) {
                relaniSamples.push({ desc: tx.description, from: meta.category || null, to: pattern.categoriaExcel });
            }
        }
        if (relaniSamples.length) {
        }
        return updated;
    }

    /**
     * Crea AutoCategoryRules a partir de patrones aprendidos.
     * Si ya existe una regla con el mismo keyword, se omite.
     */
    private async createRulesFromPatterns(
        organizationId: string,
        patrones: ExcelPattern[],
    ): Promise<{ created: number; skipped: number }> {
        let created = 0;
        let skipped = 0;

        for (const pattern of patrones) {
            const keywordLower = pattern.glosaBancariaKeyword.toLowerCase();

            // Verificar si ya existe una regla con este keyword O con esta categoría
            let existing = await this.prisma.autoCategoryRule.findFirst({
                where: {
                    organizationId,
                    keywordMatch: keywordLower,
                },
            });

            // Si no existe por keyword, buscar por categoría para agregar alias
            if (!existing) {
                existing = await this.prisma.autoCategoryRule.findFirst({
                    where: {
                        organizationId,
                        categoryName: { equals: pattern.categoriaExcel, mode: 'insensitive' },
                    },
                });
            }

            if (existing) {
                const sameCategory = existing.categoryName.trim().toLowerCase() === pattern.categoriaExcel.trim().toLowerCase();
                if (!sameCategory) {
                    existing = await this.prisma.autoCategoryRule.findFirst({
                        where: {
                            organizationId,
                            categoryName: { equals: pattern.categoriaExcel, mode: 'insensitive' },
                        },
                    });
                    if (!existing) {
                        existing = await this.prisma.autoCategoryRule.create({
                            data: {
                                organizationId,
                                keywordMatch: keywordLower,
                                categoryName: pattern.categoriaExcel,
                                isActive: true,
                                source: 'EXCEL_LEARNER',
                                confidence: pattern.confianza,
                                exampleAmount: pattern.montoEjemplo,
                            },
                        });
                        created++;
                    }
                }
                await this.prisma.glosaCategoryAlias.deleteMany({
                    where: { glosaNormalized: keywordLower, NOT: { ruleId: existing.id } },
                });
                await this.upsertGlosaCategoryAlias(
                    existing.id,
                    pattern.glosaBancariaOriginal,
                    keywordLower,
                    'EXCEL_LEARNER',
                );
                skipped++;
                continue;
            }

            // Crear nueva regla con metadata de aprendizaje
            const rule = await this.prisma.autoCategoryRule.create({
                data: {
                    organizationId,
                    keywordMatch: keywordLower,
                    categoryName: pattern.categoriaExcel,
                    isActive: true,
                    source: 'EXCEL_LEARNER',
                    confidence: pattern.confianza,
                    exampleAmount: pattern.montoEjemplo,
                },
            });

            // Crear el alias de la glosa original
            await this.upsertGlosaCategoryAlias(
                rule.id,
                pattern.glosaBancariaOriginal,
                keywordLower,
                'EXCEL_LEARNER',
            );

            this.logger.log(
                `Regla creada: "${keywordLower}" → "${pattern.categoriaExcel}" ` +
                `(${pattern.mesesDetectados} meses, confianza ${(pattern.confianza * 100).toFixed(0)}%)`,
            );
            created++;
        }

        return { created, skipped };
    }

    /**
     * Crea o actualiza un alias de glosa para una regla de categoría.
     * Si ya existe, incrementa timesMatched y actualiza lastSeenAt.
     */
    private async upsertGlosaCategoryAlias(
        ruleId: string,
        glosaBancaria: string,
        glosaNormalized: string,
        source: string,
    ): Promise<void> {
        try {
            await this.prisma.glosaCategoryAlias.upsert({
                where: {
                    ruleId_glosaNormalized: {
                        ruleId,
                        glosaNormalized,
                    },
                },
                update: {
                    timesMatched: { increment: 1 },
                    lastSeenAt: new Date(),
                },
                create: {
                    ruleId,
                    glosaBancaria,
                    glosaNormalized,
                    source,
                    timesMatched: 1,
                },
            });
        } catch (err) {
            this.logger.debug(`No se pudo crear alias: ${err.message}`);
        }
    }

    /**
     * Normaliza una glosa bancaria para agrupar patrones.
     * Elimina montos, fechas, RUTs y caracteres especiales.
     * Ej: "Traspaso Internet a T. Crédito Nro 123456" → "traspaso internet credito"
     */
    private normalizeGlosa(desc: string): string {
        return desc
            .toLowerCase()
            // Eliminar RUTs (formato XX.XXX.XXX-X)
            .replace(/\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]/gi, '')
            // Eliminar números y puntos numéricos
            .replace(/[\d.,]+/g, ' ')
            // Eliminar caracteres especiales
            .replace(/[^\w\sáéíóúñü]/g, ' ')
            // Eliminar preposiciones y artículos cortos
            .replace(/\b(a|de|del|el|la|los|las|en|por|con|nro|num|n)\b/g, ' ')
            // Colapsar espacios
            .replace(/\s+/g, ' ')
            .trim();
    }

    private extractField(row: any, names: string[]): string {
        const want = new Set(names.map((n) => n.toLowerCase()));
        for (const [k, v] of Object.entries(row || {})) {
            const n = String(k).replace(/\u00a0/g, ' ').trim().toLowerCase();
            if (!want.has(n) || v == null || v === '') continue;
            const s = String(v).trim();
            if (s) return s;
        }
        return '';
    }

    private empresaTokens(empresa: string): string[] {
        return (empresa || '')
            .toUpperCase()
            .split(/\s+/)
            .map((w) => w.replace(/[^A-ZÁÉÍÓÚÑ]/g, ''))
            .filter((w) => w.length >= 4 && !/^(PAGO|ITEM|SPA|LTDA|CHILE)$/.test(w));
    }

    private glosaMatchesEmpresa(desc: string, tokens: string[]): boolean {
        if (!tokens.length) return false;
        const d = (desc || '').toUpperCase();
        return tokens.some((t) => d.includes(t));
    }

    private pickUniqueTx<T extends { id: string; date: Date; description?: string }>(
        candidates: T[],
        usedTx: Set<string>,
        excelDate: Date | null,
        empresa?: string,
    ): T | 'ambiguous' | null {
        const free = candidates.filter((t) => !usedTx.has(t.id));
        if (free.length === 0) return null;
        const tokens = this.empresaTokens(empresa || '');
        const named = tokens.length
            ? free.filter((t) => this.glosaMatchesEmpresa(t.description || '', tokens))
            : [];
        if (named.length === 1) return named[0];
        const pool = named.length > 0 ? named : free;
        if (pool.length === 1) return pool[0];
        if (excelDate) {
            const windowDays = named.length > 0 ? 14 : 3;
            const scored = pool
                .map((t) => ({ t, days: Math.abs((t.date.getTime() - excelDate.getTime()) / 86400000) }))
                .filter((x) => x.days <= windowDays)
                .sort((a, b) => a.days - b.days || a.t.date.getTime() - b.t.date.getTime());
            if (scored.length === 1) return scored[0].t;
            if (scored.length > 1) {
                if (named.length > 0) return scored[0].t;
                if (scored[0].days !== scored[1].days) return scored[0].t;
                return 'ambiguous';
            }
        }
        if (named.length > 0) {
            return [...named].sort((a, b) => a.date.getTime() - b.date.getTime())[0];
        }
        return 'ambiguous';
    }

    private parseExcelDate(value: any): Date | null {
        if (!value && value !== 0) return null;
        if (value instanceof Date && !isNaN(value.getTime())) return value;
        if (typeof value === 'number' && value > 20000) {
            const d = new Date(Date.UTC(1899, 11, 30));
            d.setUTCDate(d.getUTCDate() + Math.floor(value));
            return d;
        }
        const s = String(value).trim();
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
        const parsed = new Date(s);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    private async annotateFromExcel(
        txId: string,
        metadata: any,
        empresa: string,
        description?: string,
        extra?: { tipoDocumento?: string; folioBoleta?: string; folioFactura?: string; honorarios?: boolean },
    ): Promise<void> {
        const meta = typeof metadata === 'object' && metadata ? { ...metadata } : {};
        meta.excelEmpresa = empresa;
        meta.autoCategorized = true;
        meta.category = empresa;
        meta.ruleName = empresa;
        meta.reviewNote = extra?.folioBoleta
            ? `[Excel: ${empresa}] Boleta ${extra.folioBoleta}`
            : `[Excel: ${empresa}]`;
        if (extra?.tipoDocumento) meta.tipoDocumento = extra.tipoDocumento;
        if (extra?.folioBoleta) meta.folioExcel = extra.folioBoleta;
        if (extra?.folioFactura) meta.folioFactura = extra.folioFactura;
        if (extra?.honorarios) meta.honorarios = true;
        const commerce = extractCommerceFromGlosa(description || '');
        if (commerce) meta.commerceFromGlosa = commerce;
        await this.prisma.bankTransaction.update({
            where: { id: txId },
            data: {
                status: TransactionStatus.MATCHED,
                metadata: meta,
            },
        });
    }

    /**
     * Extrae el nombre de empresa/categoría de una fila del Excel.
     */
    private extractEmpresa(row: any): string | null {
        for (const col of EXCEL_EMPRESA_COLS) {
            const val = row[col];
            if (val && typeof val === 'string' && val.trim().length > 0) {
                return val.trim();
            }
        }
        return null;
    }

    /**
     * Convierte nombre de hoja "ENERO 2026" a rango de fechas.
     */
    private parseMonthRange(sheetName: string): { from: Date; to: Date } | null {
        const monthNames: Record<string, number> = {
            ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3,
            MAYO: 4, JUNIO: 5, JULIO: 6, AGOSTO: 7,
            SEPTIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11,
        };

        const parts = sheetName.toUpperCase().split(/\s+/);
        if (parts.length !== 2) return null;

        const monthIdx = monthNames[parts[0]];
        const year = parseInt(parts[1], 10);
        if (monthIdx === undefined || isNaN(year)) return null;

        const from = new Date(year, monthIdx, 1);
        const to = new Date(year, monthIdx + 1, 0, 23, 59, 59); // Último día del mes
        return { from, to };
    }

    /**
     * Ruta por defecto del Excel de Pagos.
     */
    private getDefaultExcelPath(): string {
        return path.join('e:', 'BRAVIUM-PRODUCCION', 'CARTOLAS', 'EXCEL CARTOLAS 2026', 'Pagos CL 2026.xlsx');
    }
}
