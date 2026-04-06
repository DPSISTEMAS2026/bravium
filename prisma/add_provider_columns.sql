-- Migración segura: Agregar columnas de datos bancarios y CRM a la tabla providers
-- Usa IF NOT EXISTS para que sea idempotente (se puede ejecutar múltiples veces sin error)

-- ═══ DATOS BANCARIOS ═══
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "transferBankName" TEXT;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "transferAccountNumber" TEXT;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "transferAccountType" TEXT;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "transferRut" TEXT;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "transferEmail" TEXT;

-- ═══ DATOS CRM / FICHA COMERCIAL ═══
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "logisticsContact" TEXT;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "creditLine" INTEGER;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "comments" TEXT;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "deliveryTime" TEXT;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "differential" TEXT;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "boardReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "favorableBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "currentBalance" INTEGER NOT NULL DEFAULT 0;
