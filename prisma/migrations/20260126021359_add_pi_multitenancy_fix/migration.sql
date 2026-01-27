-- AlterTable
ALTER TABLE "cost_alerts" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "external_offers" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "product_aliases" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "product_price_history" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "purchase_recommendations" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "supplier_products" ADD COLUMN     "organizationId" TEXT;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_offers" ADD CONSTRAINT "external_offers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_alerts" ADD CONSTRAINT "cost_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
