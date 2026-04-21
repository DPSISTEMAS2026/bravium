import { DTE } from '@prisma/client';

type ProviderAliasMap = Record<string, string[]>;

const NOISE_WORDS = new Set([
    'S.A.', 'SA', 'SPA', 'LTDA', 'LTDA.', 'LIMITADA', 'COMERCIAL',
    'SOCIEDAD', 'ANONIMA', 'CIA', 'CIA.', 'COMPANIA', 'DE', 'DEL',
    'LOS', 'LAS', 'LA', 'EL', 'EN', 'Y', 'E', 'CHILE', 'SERVICIOS',
    'INVERSIONES', 'IMPORTADORA', 'EXPORTADORA', 'INGENIERIA',
]);

let cachedAliases: ProviderAliasMap | null = null;

function parseProviderAliases(): ProviderAliasMap {
    if (cachedAliases) return cachedAliases;

    const raw = process.env.MATCH_PROVIDER_ALIASES;
    const out: ProviderAliasMap = {};
    if (raw && typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw) as Record<string, string | string[]>;
            for (const [key, val] of Object.entries(parsed)) {
                out[key.toUpperCase()] = Array.isArray(val)
                    ? val.map((v) => String(v).toUpperCase())
                    : [String(val).toUpperCase()];
            }
        } catch { /* ignore malformed JSON */ }
    }
    if (!out['ENTEL']) out['ENTEL'] = ['PCS', 'ENTEL', 'ENTEL PCS'];
    cachedAliases = out;
    return out;
}

export function normalizeProviderName(name: string): string {
    return name
        .toUpperCase()
        .replace(/[.,\-()]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1 && !NOISE_WORDS.has(w))
        .join(' ')
        .trim();
}

/**
 * Determines whether a bank transaction description matches a provider name.
 * Uses multiple heuristics: configured aliases, direct containment,
 * normalized name comparison, significant first word, word overlap, and RUT.
 */
export function providerMatchesDescription(
    description: string,
    providerName: string | undefined,
    dte?: DTE & { provider?: { name: string, rut?: string } | null },
    txProviderRut?: string | null,
): boolean {
    if (txProviderRut && txProviderRut.trim() !== '') {
        // Strict RUT Matching rules to evade false positives
        const dteRut = dte?.provider?.rut || dte?.rutIssuer;
        if (dteRut) {
            const txR = txProviderRut.replace(/[^0-9Kk]/g, '').toUpperCase();
            const dteR = dteRut.replace(/[^0-9Kk]/g, '').toUpperCase();
            if (txR === dteR) return true;
        }
        return false; // El banco tiene un RUT explícito. Si no cuadra, forzamos rechazo (evasión de falsos positivos).
    }

    const descUpper = (description || '').toUpperCase();
    const provUpper = (providerName || '').toUpperCase();
    if (!provUpper) return true;

    const aliases = parseProviderAliases();

    // 1. Configured aliases
    for (const [keyword, aliasList] of Object.entries(aliases)) {
        if (!descUpper.includes(keyword)) continue;
        if (aliasList.some((a) => provUpper.includes(a) || a.includes(provUpper))) return true;
    }

    // 2. Direct containment
    if (descUpper.includes(provUpper) || provUpper.includes(descUpper)) return true;

    // 3. Normalized comparison (strips S.A., SPA, LTDA, etc.)
    const normProv = normalizeProviderName(provUpper);
    const normDesc = normalizeProviderName(descUpper);
    if (normProv && normDesc && (normDesc.includes(normProv) || normProv.includes(normDesc))) return true;

    // 4. First significant word of the provider (e.g. "FALABELLA" from "FALABELLA RETAIL SA")
    const provWords = normProv.split(/\s+/).filter((w) => w.length > 2);
    const firstWord = provWords[0];
    if (firstWord && firstWord.length >= 4 && descUpper.includes(firstWord)) return true;

    // 5. Description words contained in the provider name
    const descWords = descUpper.split(/\s+/).filter((w) => w.length > 3 && !NOISE_WORDS.has(w));
    for (const w of descWords) {
        if (normProv.includes(w)) return true;
    }

    // 6. Provider words (>= 4 chars) contained in the description
    for (const w of provWords) {
        if (w.length >= 4 && descUpper.includes(w)) return true;
    }

    // 7. RUT match
    if (dte?.rutIssuer) {
        const r = dte.rutIssuer.replace(/[^0-9]/g, '');
        const descDigits = descUpper.replace(/[^0-9]/g, '');
        if (descDigits.length > 5 && r.length > 5 && (descDigits.includes(r) || r.includes(descDigits))) {
            return true;
        }
    }

    return false;
}

/**
 * Checks whether a DTE date is within an acceptable window of a bank
 * transaction. Uses absolute difference — a DTE can be issued before
 * OR after the payment (common in Chile: invoices often arrive weeks
 * after the payment was made).
 */
export function isWithinDateWindow(txDate: Date, dteDate: Date, dateWindowDays: number): boolean {
    const tx = new Date(txDate).getTime();
    const dte = new Date(dteDate).getTime();
    const DAY = 24 * 60 * 60 * 1000;
    const absDiff = Math.abs(tx - dte) / DAY;
    return absDiff <= dateWindowDays;
}
