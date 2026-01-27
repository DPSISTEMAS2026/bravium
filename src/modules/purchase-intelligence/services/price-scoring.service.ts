import { Injectable } from '@nestjs/common';
import { PriceSource, ProductPriceHistory } from '@prisma/client';

@Injectable()
export class PriceScoringService {

    /**
     * Calculates a 0-100 score representing how "sure" we are about this recommendation.
     */
    calculateConfidence(
        history: ProductPriceHistory[],
        recommendationSource: 'INTERNAL_HISTORY' | 'EXTERNAL_OFFER'
    ): number {
        let score = 50; // Base score

        // 1. Data Volume Bonus
        if (history.length > 5) score += 20;
        else if (history.length > 2) score += 10;

        // 2. Recency Bonus (Is the comparison data fresh?)
        const latest = history[0];
        if (latest) {
            const daysSince = (Date.now() - latest.date.getTime()) / (1000 * 3600 * 24);
            if (daysSince < 7) score += 15;
            else if (daysSince < 30) score += 5;
            else score -= 10; // Old data
        }

        // 3. Source Reliability
        if (recommendationSource === 'EXTERNAL_OFFER') {
            // External offers are inherently riskier (stock might not exist)
            score -= 10;
        } else {
            // Internal history is solid fact
            score += 10;
        }

        // 4. Variance Check (Stability)
        // If prices fluctuate wildly, our average might be misleading
        if (history.length >= 3) {
            const prices = history.map(h => h.price);
            const avg = prices.reduce((a, b) => a + b) / prices.length;
            const variance = prices.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / prices.length;
            const stdDev = Math.sqrt(variance);

            const cv = stdDev / avg; // Coefficient of Variation
            if (cv < 0.1) score += 15; // Very stable price
            else if (cv > 0.3) score -= 15; // Volatile
        }

        return Math.min(100, Math.max(0, score));
    }
}
