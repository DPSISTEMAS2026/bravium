import { Module } from '@nestjs/common';
import { PriceComparisonService } from './services/price-comparison.service';
import { ExternalPriceService } from './services/external-price.service';
import { PurchaseHistoryIngestionService } from './services/ingestion.service';
import { PurchaseRecommendationService } from './services/purchase-recommendation.service';
import { PriceScoringService } from './services/price-scoring.service';
import { ProductNormalizationService } from './services/product-normalization.service';
import { PurchaseIntelligenceController } from './controllers/purchase-intelligence.controller';

@Module({
    controllers: [PurchaseIntelligenceController],
    providers: [
        PriceComparisonService,
        ExternalPriceService,
        PurchaseHistoryIngestionService,
        PurchaseRecommendationService,
        PriceScoringService,
        ProductNormalizationService,
    ],
    exports: [
        PriceComparisonService,
        ExternalPriceService,
        PurchaseHistoryIngestionService,
        PurchaseRecommendationService,
        PriceScoringService,
        ProductNormalizationService,
    ],
})
export class PurchaseIntelligenceModule { }
