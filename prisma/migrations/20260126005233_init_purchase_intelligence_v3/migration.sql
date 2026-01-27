-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'MATCHED', 'PARTIALLY_MATCHED', 'UNMATCHED');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('DTE', 'PURCHASE_ORDER', 'EXTERNAL_SCRAPING', 'MANUAL_QUOTE');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('BETTER_PRICE_AVAILABLE', 'HISTORICAL_OVERPRICING', 'BUY_BULK_OPPORTUNITY', 'VENDOR_CHANGE_SUGGESTED');

-- CreateEnum
CREATE TYPE "CostAlertType" AS ENUM ('PRICE_SPIKE', 'MARKET_DRIFT', 'ABOVE_MARKET_AVG');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'IGNORED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'CHECK', 'CASH', 'CREDIT_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('ISSUED', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DtePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'OVERPAID');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('SMALL_DIFFERENCE_FAVOR', 'SMALL_DIFFERENCE_AGAINST', 'EXCHANGE_RATE', 'WRITE_OFF', 'CARRY_UNDER');

-- CreateEnum
CREATE TYPE "DataOrigin" AS ENUM ('LEGACY_EXCEL', 'N8N_AUTOMATION', 'MANUAL_UPLOAD', 'API_INTEGRATION');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('INVOICE_RECEIVED', 'PAYMENT_ISSUED', 'CREDIT_NOTE_RECEIVED', 'DEBIT_NOTE_RECEIVED', 'ADJUSTMENT', 'EXPENSE_BY_DIFFERENCE', 'INCOME_BY_DIFFERENCE', 'MANUAL_ENTRY', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "ReferenceType" AS ENUM ('DTE', 'PAYMENT', 'MATCH', 'ADJUSTMENT', 'NONE', 'LEGACY_EXCEL');

-- CreateEnum
CREATE TYPE "MatchOrigin" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('NUBOX_PRO', 'SII_LIBRO_DIARIO', 'GENERIC_EXCEL');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'GERENCIA', 'COMPRAS', 'CONTADOR', 'AUDITOR');

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "rutHolder" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "origin" "DataOrigin" NOT NULL DEFAULT 'API_INTEGRATION',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "currentBalance" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "averagePrice" INTEGER NOT NULL DEFAULT 0,
    "minPrice" INTEGER NOT NULL DEFAULT 0,
    "maxPrice" INTEGER NOT NULL DEFAULT 0,
    "lastPrice" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_products" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "lastPrice" INTEGER NOT NULL DEFAULT 0,
    "lastPurchaseDate" TIMESTAMP(3),
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_price_history" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "providerId" TEXT,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "date" TIMESTAMP(3) NOT NULL,
    "source" "PriceSource" NOT NULL,
    "referenceId" TEXT,
    "quantity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_offers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "url" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_recommendations" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "RecommendationType" NOT NULL,
    "description" TEXT NOT NULL,
    "explanation" TEXT,
    "potentialSaving" INTEGER NOT NULL,
    "savingPct" DOUBLE PRECISION NOT NULL,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "suggestedProviderId" TEXT,
    "suggestedUrl" TEXT,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_aliases" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "aliasName" TEXT NOT NULL,
    "source" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_alerts" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "CostAlertType" NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detectedValue" INTEGER NOT NULL,
    "referenceValue" INTEGER NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "providerId" TEXT,
    "amount" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "internalReference" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'ISSUED',
    "origin" "DataOrigin" NOT NULL DEFAULT 'MANUAL_UPLOAD',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dtes" (
    "id" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "type" INTEGER NOT NULL,
    "rutIssuer" TEXT NOT NULL,
    "rutReceiver" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "issuedDate" TIMESTAMP(3) NOT NULL,
    "siiStatus" TEXT NOT NULL,
    "providerId" TEXT,
    "paymentStatus" "DtePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "outstandingAmount" INTEGER NOT NULL,
    "origin" "DataOrigin" NOT NULL DEFAULT 'API_INTEGRATION',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dtes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_matches" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "paymentId" TEXT,
    "dteId" TEXT,
    "origin" "MatchOrigin" NOT NULL DEFAULT 'AUTOMATIC',
    "status" "MatchStatus" NOT NULL DEFAULT 'DRAFT',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "ruleApplied" TEXT,
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "reconciliation_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_adjustments" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "AdjustmentReason" NOT NULL,
    "description" TEXT,
    "matchId" TEXT,
    "periodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "balance_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger_entries" (
    "id" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "providerId" TEXT,
    "periodId" TEXT,
    "organizationId" TEXT,
    "type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "referenceType" "ReferenceType" NOT NULL,
    "referenceId" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "financial_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "fileUrl" TEXT,
    "rowCount" INTEGER NOT NULL,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_alerts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "periodId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "financial_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'PRO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'COMPRAS',
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "systemEvent" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "organizationId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "providers_rut_key" ON "providers"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_products_productId_providerId_key" ON "supplier_products"("productId", "providerId");

-- CreateIndex
CREATE INDEX "product_price_history_productId_date_idx" ON "product_price_history"("productId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "product_aliases_aliasName_key" ON "product_aliases"("aliasName");

-- CreateIndex
CREATE UNIQUE INDEX "dtes_rutIssuer_type_folio_key" ON "dtes"("rutIssuer", "type", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_year_month_key" ON "accounting_periods"("year", "month");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_providerId_transactionDate_idx" ON "financial_ledger_entries"("providerId", "transactionDate");

-- CreateIndex
CREATE INDEX "financial_alerts_status_severity_idx" ON "financial_alerts"("status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_rut_key" ON "organizations"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_action_idx" ON "audit_logs"("organizationId", "action");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_offers" ADD CONSTRAINT "external_offers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_alerts" ADD CONSTRAINT "cost_alerts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtes" ADD CONSTRAINT "dtes_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_dteId_fkey" FOREIGN KEY ("dteId") REFERENCES "dtes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "reconciliation_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "accounting_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "accounting_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_alerts" ADD CONSTRAINT "financial_alerts_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "accounting_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
