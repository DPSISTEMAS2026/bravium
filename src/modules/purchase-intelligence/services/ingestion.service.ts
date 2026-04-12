import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DTE, Product } from '@prisma/client';

@Injectable()
export class PurchaseHistoryIngestionService {
    private readonly logger = new Logger(PurchaseHistoryIngestionService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * This method is called asynchronously when a Component in the Core finishes processing a DTE.
     * It extracts line items and updates the Intelligence module.
     * NO financial transactions are created here.
     */
    async processDteForIntelligence(dteId: string, lineItems: any[]) {
        const dte = await this.prisma.dTE.findUnique({ 
            where: { id: dteId },
            include: { provider: true }
        });
        if (!dte) return;

        const organizationId = dte.organizationId;
        if (!organizationId) {
            this.logger.warn(`DTE ${dteId} has no organizationId. Skipping intelligence ingestion.`);
            return;
        }

        for (const item of lineItems) {
            // 1. Resolve or Create Product (The "Standardization" problem)
            const product = await this.resolveProduct(organizationId, item.name, item.sku);

            // 2. Log Price History
            await this.prisma.productPriceHistory.create({
                data: {
                    productId: product.id,
                    providerId: dte.providerId,
                    price: item.price,
                    date: dte.issuedDate,
                    source: 'DTE',
                    referenceId: dte.id,
                    quantity: item.quantity,
                }
            });

            // 3. Update Product Stats
            await this.updateMsgProductStats(product, item.price);

            // 4. Update Supplier Catalog
            if (dte.providerId) {
                await this.updateSupplierProduct(product.id, dte.providerId, item.price, item.sku);
            }
        }
    }

    private async resolveProduct(organizationId: string, name: string, sku: string): Promise<Product> {
        // Simplified logic: Find by SKU or Name, else create.
        // In real world, this needs fuzzy matching or manual approval queue.
        let product = await this.prisma.product.findFirst({
            where: { sku: sku || 'UNKNOWN', organizationId }
        });

        if (!product) {
            product = await this.prisma.product.create({
                data: {
                    name: name,
                    sku: sku || `GEN-${Date.now()}`,
                    description: 'Auto-created from DTE',
                    organizationId,
                }
            });
        }
        return product;
    }

    private async updateMsgProductStats(product: Product, newPrice: number) {
        // Recalc average, min, max
        // This is a simplification. Usually done via aggregation query.
        await this.prisma.product.update({
            where: { id: product.id },
            data: {
                lastPrice: newPrice,
                // averagePrice: ... (complex logic omitted)
            }
        });
    }

    private async updateSupplierProduct(productId: string, providerId: string, price: number, sku: string) {
        const exists = await this.prisma.supplierProduct.findUnique({
            where: { productId_providerId: { productId, providerId } }
        });

        if (exists) {
            await this.prisma.supplierProduct.update({
                where: { id: exists.id },
                data: { lastPrice: price, lastPurchaseDate: new Date() }
            });
        } else {
            await this.prisma.supplierProduct.create({
                data: {
                    productId,
                    providerId,
                    lastPrice: price,
                    lastPurchaseDate: new Date(),
                    supplierSku: sku
                }
            });
        }
    }
}
