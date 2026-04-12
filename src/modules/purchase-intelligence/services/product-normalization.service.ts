import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Product, ProductAlias } from '@prisma/client';

@Injectable()
export class ProductNormalizationService {
    private readonly logger = new Logger(ProductNormalizationService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Main entry point to resolve a raw DTE item name to a Canonical Product.
     * Strategies:
     * 1. Exact Match via Product.sku
     * 2. Exact Match via ProductAlias (Learned mappings)
     * 3. Fuzzy Match (Heuristic) -> Returns Candidate or Null
     */
    async normalize(organizationId: string, rawName: string, sku?: string): Promise<Product | null> {
        const cleanName = rawName.toUpperCase().trim();

        // 1. Try SKU Match (High Confidence)
        if (sku) {
            const bySku = await this.prisma.product.findUnique({ 
                where: { sku_organizationId: { sku, organizationId } } 
            });
            if (bySku) return bySku;
        }

        // 2. Try Alias Match (High Confidence - Learned)
        const byAlias = await this.prisma.productAlias.findUnique({
            where: { aliasName_organizationId: { aliasName: cleanName, organizationId } },
            include: { product: true },
        });
        if (byAlias) return (byAlias as any).product;

        // 3. Fuzzy Match (Lower Confidence)
        return this.findFuzzyMatch(organizationId, cleanName);
    }

    /**
     * Registers a user correction: "This weird name actually means Product X".
     */
    async learnAlias(organizationId: string, rawName: string, productId: string, source?: string) {
        const cleanName = rawName.toUpperCase().trim();

        try {
            await this.prisma.productAlias.create({
                data: {
                    aliasName: cleanName,
                    productId,
                    organizationId,
                    source,
                    confidence: 1.0, // Manual = 100%
                },
            });
            this.logger.log(`Learned alias: "${cleanName}" -> Product ID ${productId}`);
        } catch (e) {
            // Alias might already exist
            this.logger.warn(`Alias "${cleanName}" already exists.`);
        }
    }

    /**
     * Simple Token-Based Matching Strategy (In-Memory for Architecture Demo).
     * In Production: Use pg_trgm or ElasticSearch.
     */
    private async findFuzzyMatch(organizationId: string, targetName: string): Promise<Product | null> {
        // Optimization: Load only names and IDs (Cache this in real app)
        const allProducts = await this.prisma.product.findMany({ 
            where: { organizationId },
            select: { id: true, name: true } 
        });

        let bestMatch: Product | null = null;
        let maxScore = 0;

        const targetTokens = this.tokenize(targetName);

        for (const prod of allProducts) {
            const prodTokens = this.tokenize(prod.name);

            // Jaccard Similarityish
            const intersection = targetTokens.filter(t => prodTokens.includes(t));
            const score = intersection.length / Math.max(targetTokens.length, prodTokens.length);

            if (score > 0.6 && score > maxScore) { // Threshold
                maxScore = score;
                bestMatch = prod as any; // Cast needed as we only selected subset
            }
        }

        // Only return if confidence is decent
        return maxScore > 0.7 ? bestMatch : null;
    }

    private tokenize(str: string): string[] {
        return str.split(/[\s,\.-]+/).filter(x => x.length > 2);
    }
}
