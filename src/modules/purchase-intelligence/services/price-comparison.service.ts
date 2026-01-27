import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Product, ProductPriceHistory, PurchaseRecommendation, RecommendationType, RecommendationStatus } from '@prisma/client';

@Injectable()
export class PriceComparisonService {
    private readonly logger = new Logger(PriceComparisonService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Compare the latest purchase price of a product vs its historical average.
     * Generates a recommendation if overpricing is detected.
     */
    async analyzePricePerformance(productId: string) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            include: { priceHistory: { orderBy: { date: 'desc' }, take: 5 } },
        });

        if (!product || product.priceHistory.length < 2) return;

        const latest = product.priceHistory[0];
        const previousPrices = product.priceHistory.slice(1);

        // Calculate historic average (excluding latest for comparison)
        const avgPrice = previousPrices.reduce((sum, p) => sum + p.price, 0) / previousPrices.length;

        // Threshold: If latest price is > 10% of average
        const threshold = avgPrice * 1.10;

        if (latest.price > threshold) {
            await this.createOverpriceRecommendation(product, latest.price, avgPrice);
        }
    }

    /**
     * Find cheaper alternative providers for a given product based on history.
     */
    async findCheaperProviders(productId: string) {
        // Logic: Look at SupplierProduct table to see who has sold this cheaper recently.
        // ...
    }

    private async createOverpriceRecommendation(product: Product, currentPrice: number, avgPrice: number) {
        const diff = currentPrice - avgPrice;
        const diffPct = ((currentPrice - avgPrice) / avgPrice) * 100;

        await this.prisma.purchaseRecommendation.create({
            data: {
                productId: product.id,
                type: RecommendationType.HISTORICAL_OVERPRICING,
                description: `El precio actual ($${currentPrice}) es un ${diffPct.toFixed(1)}% más alto que el promedio histórico ($${avgPrice.toFixed(0)}).`,
                potentialSaving: Math.round(diff), // Unit saving
                savingPct: diffPct,
                status: RecommendationStatus.PENDING,
            }
        });

        this.logger.warn(`Overprice detected for ${product.name}: ${diffPct.toFixed(1)}% above average.`);
    }
}
