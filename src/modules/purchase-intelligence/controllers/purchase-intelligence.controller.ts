import { Controller, Get, Post, Param, Body, UseGuards, Query, Request } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RecommendationStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { OrganizationGuard } from '../../../common/guards/organization.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, OrganizationGuard)
@Controller('purchase-intelligence')
export class PurchaseIntelligenceController {
    constructor(private prisma: PrismaService) { }

    @Get('recommendations')
    async getRecommendations(@Request() req: any, @Query('status') status?: RecommendationStatus) {
        const where: any = { organizationId: req.organizationId };
        if (status) where.status = status;
        else where.status = { in: ['PENDING', 'ACCEPTED'] }; // Default filters

        const recommendations = await this.prisma.purchaseRecommendation.findMany({
            where,
            include: {
                product: { select: { id: true, name: true, lastPrice: true, unit: true } },
            },
            orderBy: { confidenceScore: 'desc' },
        });

        // Transform for UI
        return recommendations.map(rec => ({
            id: rec.id,
            productName: rec.product.name,
            currentPrice: rec.product.lastPrice,
            recommendedPrice: rec.product.lastPrice - rec.potentialSaving,
            savingPct: rec.savingPct,
            confidenceScore: rec.confidenceScore,
            explanation: rec.explanation || rec.description,
            status: rec.status,
        }));
    }

    @Roles(UserRole.GERENCIA, UserRole.ADMIN)
    @Post('recommendations/:id/action')
    async handleRecommendationAction(
        @Request() req: any,
        @Param('id') id: string,
        @Body('action') action: 'ACCEPT' | 'REJECT' | 'IGNORE'
    ) {
        let newStatus: RecommendationStatus;
        switch (action) {
            case 'ACCEPT': newStatus = 'ACCEPTED'; break;
            case 'REJECT': newStatus = 'REJECTED'; break;
            case 'IGNORE': newStatus = 'IGNORED'; break;
            default: throw new Error('Invalid action');
        }

        // Use findFirst to verify ownership before update
        const rec = await this.prisma.purchaseRecommendation.findFirst({
            where: { id, organizationId: req.organizationId },
        });

        if (!rec) {
            throw new Error('Recommendation not found or access denied');
        }

        await this.prisma.purchaseRecommendation.update({
            where: { id },
            data: { status: newStatus },
        });

        return { success: true };
    }

    @Get('products/:id/analysis')
    async getProductAnalysis(@Request() req: any, @Param('id') id: string) {
        const product = await this.prisma.product.findFirst({
            where: { id, organizationId: req.organizationId },
            include: {
                priceHistory: { orderBy: { date: 'desc' }, take: 12 },
                externalOffers: { where: { isValid: true } },
            }
        });

        if (!product) return null;

        // Build timeline dataset
        const timeline = product.priceHistory.map(h => ({
            date: h.date,
            price: h.price,
            source: h.source
        }));

        return {
            product: { name: product.name, sku: product.sku },
            timeline,
            offers: product.externalOffers,
        };
    }
}
