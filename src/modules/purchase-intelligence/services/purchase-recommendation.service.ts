import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Product, RecommendationType, RecommendationStatus } from '@prisma/client';
import { PriceScoringService } from './price-scoring.service';

@Injectable()
export class PurchaseRecommendationService {
    private readonly logger = new Logger(PurchaseRecommendationService.name);

    constructor(
        private prisma: PrismaService,
        private scoringService: PriceScoringService
    ) { }

    /**
     * Evaluates a product to generate actionable savings recommendations.
     */
    async evaluateProduct(productId: string) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            include: {
                priceHistory: { orderBy: { date: 'desc' }, take: 10 },
                // Could also include externalOffers to compare
            },
        });

        if (!product || product.priceHistory.length < 2) return;

        // 1. Check for Historical Overpricing (Am I paying more now than before?)
        await this.checkHistoricalOverpricing(product);

        // 2. Check market drift (Am I paying more than "Average"?) - TODO
    }

    private async checkHistoricalOverpricing(product: Product & { priceHistory: any[] }) {
        const latest = product.priceHistory[0];
        const previous = product.priceHistory.slice(1);

        // Avg of last 5 purchases
        const recentHistory = previous.slice(0, 5);
        const avgPrice = recentHistory.reduce((sum, p) => sum + p.price, 0) / recentHistory.length;

        // Threshold: 10% increase
        if (latest.price > avgPrice * 1.10) {
            const diffPct = ((latest.price - avgPrice) / avgPrice) * 100;
            const confidence = this.scoringService.calculateConfidence(product.priceHistory, 'INTERNAL_HISTORY');

            await this.createRecommendation({
                productId: product.id,
                type: RecommendationType.HISTORICAL_OVERPRICING,
                description: `Subida de precio detectada: ${diffPct.toFixed(1)}% vs promedio reciente.`,
                explanation: `Tu última compra fue a $${latest.price}, mientras que tu promedio es $${Math.round(avgPrice)}.`,
                potentialSaving: Math.round(latest.price - avgPrice),
                savingPct: diffPct,
                confidenceScore: confidence
            });
        }
    }

    private async createRecommendation(data: {
        productId: string;
        type: RecommendationType;
        description: string;
        explanation: string;
        potentialSaving: number;
        savingPct: number;
        confidenceScore: number;
        suggestedUrl?: string;
    }) {
        // Prevent duplicates? logic omitted for brevity
        await this.prisma.purchaseRecommendation.create({
            data: {
                ...data,
                status: RecommendationStatus.PENDING,
            }
        });

        this.logger.log(`Generated Recommendation for ${data.productId}: ${data.description} (Score: ${data.confidenceScore})`);
    }
}
