import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Product, ExternalOffer, RecommendationType, RecommendationStatus } from '@prisma/client';

@Injectable()
export class ExternalPriceService {
    private readonly logger = new Logger(ExternalPriceService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Registers a new external offer found via scraping or manual input.
     * Compares with internal price and generates recommendation if cheaper.
     */
    async registerExternalOffer(
        productId: string,
        vendorName: string,
        price: number,
        url: string
    ): Promise<ExternalOffer> {

        // 1. Save the Offer
        const offer = await this.prisma.externalOffer.create({
            data: {
                productId,
                vendorName,
                price,
                url,
                lastCheckedAt: new Date(),
            }
        });

        // 2. Compare with internal reference
        await this.compareWithInternal(productId, offer);

        return offer;
    }

    private async compareWithInternal(productId: string, offer: ExternalOffer) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId }
        });

        if (!product || product.lastPrice === 0) return;

        // Check if external offer is significantly better (e.g. > 5% cheaper)
        const distinctThreshold = product.lastPrice * 0.95;

        if (offer.price < distinctThreshold) {
            const saving = product.lastPrice - offer.price;
            const savingPct = (saving / product.lastPrice) * 100;

            await this.prisma.purchaseRecommendation.create({
                data: {
                    productId,
                    type: RecommendationType.BETTER_PRICE_AVAILABLE,
                    description: `Encontrado en ${offer.vendorName} a $${offer.price} (Ahorro: $${saving}).`,
                    potentialSaving: saving,
                    savingPct: savingPct,
                    suggestedUrl: offer.url,
                    status: RecommendationStatus.PENDING,
                }
            });

            this.logger.log(`External savings found for ${product.name}: ${offer.vendorName}`);
        }
    }
}
