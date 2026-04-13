import { Injectable, Logger } from '@nestjs/common';
import { BankTransaction, Payment, DTE } from '@prisma/client';
import { MatchingStrategy, MatchCandidate } from '../domain/matching.interfaces';
import {
    isWithinDateWindow,
    providerMatchesDescription,
    normalizeProviderName,
} from '../utils/provider-matcher';

type DteWithProvider = DTE & { provider?: { name: string } | null };

/**
 * Smart AmountMatch: multi-criteria scoring engine.
 *
 * Scoring weights:
 *   - Amount proximity     (40%)
 *   - Date proximity       (35%)
 *   - Provider/description (25%)
 *
 * CRITICAL RULE: An exact amount match (diff <= $10) is always surfaced
 * as a candidate regardless of date or provider score. Exact amounts are
 * the strongest conciliation signal and must never be silently discarded.
 */
@Injectable()
export class AmountMatchStrategy implements MatchingStrategy {
    public name = 'AmountMatch';
    private readonly logger = new Logger(AmountMatchStrategy.name);
    private readonly amountToleranceClp: number;
    private readonly dateWindowDays: number;

    constructor() {
        const raw = process.env.MATCH_AMOUNT_TOLERANCE_CLP;
        const parsed = raw ? Number.parseInt(raw, 10) : NaN;
        this.amountToleranceClp = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;

        const windowRaw = process.env.MATCH_DATE_WINDOW_DAYS;
        const windowParsed = windowRaw ? Number.parseInt(windowRaw, 10) : NaN;
        this.dateWindowDays = Number.isFinite(windowParsed) && windowParsed >= 0 ? windowParsed : 60;
    }

    async findMatches(
        transaction: BankTransaction,
        _payments: Payment[],
        dtes: DteWithProvider[],
    ): Promise<MatchCandidate | null> {
        const txAbs = Math.abs(transaction.amount);
        const txDate = new Date(transaction.date);
        const txDesc = (transaction.description || '').toUpperCase();

        const scored: MatchCandidate['candidates'] = [];

        for (const dte of dtes) {
            const dteAbs = Math.abs(dte.totalAmount);
            const amountDiff = Math.abs(txAbs - dteAbs);

            if (amountDiff > this.amountToleranceClp) continue;
            if (!isWithinDateWindow(txDate, dte.issuedDate, this.dateWindowDays)) continue;

            const amountScore = this.scoreAmount(txAbs, dteAbs);
            const dateScore = this.scoreDate(txDate, dte.issuedDate);
            const providerScore = this.scoreProvider(txDesc, dte);

            let totalScore =
                amountScore * 0.30 +
                dateScore * 0.45 +
                providerScore * 0.25;

            // Near-exact amount (±$10) is the strongest conciliation signal.
            // Guarantee a minimum score so it always surfaces as a DRAFT.
            // For larger diffs within tolerance, let the natural score decide.
            if (amountDiff <= 10 && totalScore < 0.55) {
                totalScore = 0.55;
            }

            const reasons: string[] = [];
            if (amountDiff === 0) reasons.push(`Monto exacto $${txAbs.toLocaleString('es-CL')}`);
            else if (amountDiff <= 10) reasons.push(`Monto ±$${amountDiff} (exacto)`);
            else reasons.push(`Monto ±$${amountDiff.toLocaleString('es-CL')}`);

            const daysDiff = Math.abs(Math.round((txDate.getTime() - new Date(dte.issuedDate).getTime()) / 86400000));
            reasons.push(`${daysDiff}d diferencia`);

            if (providerScore > 0.5) reasons.push(`Empresa coincide: ${dte.provider?.name || dte.rutIssuer}`);

            scored.push({
                dte,
                score: Math.round(totalScore * 100) / 100,
                reason: reasons.join(' | '),
            });
        }

        if (scored.length === 0) return null;

        scored.sort((a, b) => b.score - a.score);

        // Always return candidates — the service layer decides CONFIRMED vs DRAFT
        return { transaction, candidates: scored.slice(0, 5) };
    }

    private scoreAmount(txAmount: number, dteAmount: number): number {
        const diff = Math.abs(txAmount - dteAmount);
        if (diff === 0) return 1.0;
        return Math.max(0, 1.0 - diff / this.amountToleranceClp);
    }

    private scoreDate(txDate: Date, dteDate: Date): number {
        const daysDiff = Math.abs(txDate.getTime() - new Date(dteDate).getTime()) / 86400000;
        if (daysDiff <= 1) return 1.0;
        if (daysDiff <= 3) return 0.95;
        if (daysDiff <= 7) return 0.85;
        if (daysDiff <= 15) return 0.70;
        if (daysDiff <= 30) return 0.30; // Penalización fuerte al mes
        return Math.max(0, 0.5 - daysDiff / this.dateWindowDays);
    }

    private scoreProvider(txDesc: string, dte: DteWithProvider): number {
        const providerName = dte.provider?.name;
        if (!providerName) return 0.3;

        if (providerMatchesDescription(txDesc, providerName, dte)) {
            const normProv = normalizeProviderName(providerName);
            const normDesc = normalizeProviderName(txDesc);

            if (normDesc.includes(normProv) || normProv.includes(normDesc)) return 1.0;

            const provWords = normProv.split(/\s+/).filter(w => w.length >= 4);
            const matchedWords = provWords.filter(w => txDesc.toUpperCase().includes(w));
            if (matchedWords.length > 0) return 0.7 + (matchedWords.length / provWords.length) * 0.3;

            return 0.6;
        }

        return 0.0;
    }
}
