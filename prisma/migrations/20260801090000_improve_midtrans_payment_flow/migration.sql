-- Split payment state from order fulfillment state and persist Midtrans metadata.
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED');

ALTER TABLE "Order"
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "paymentRedirectUrl" TEXT,
  ADD COLUMN "midtransTransactionId" TEXT,
  ADD COLUMN "midtransTransactionStatus" TEXT,
  ADD COLUMN "midtransFraudStatus" TEXT,
  ADD COLUMN "midtransStatusCode" TEXT,
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "paymentExpiredAt" TIMESTAMP(3),
  ADD COLUMN "paymentStockRestoredAt" TIMESTAMP(3);

UPDATE "Order"
SET "paymentRedirectUrl" = "paymentInvoiceUrl"
WHERE "paymentRedirectUrl" IS NULL
  AND "paymentInvoiceUrl" IS NOT NULL;

UPDATE "Order"
SET "paymentStatus" = 'PAID',
    "paidAt" = COALESCE("paidAt", "updatedAt")
WHERE "status" IN ('PROCESSING', 'SHIPPED', 'CONFIRMED')
  AND "paymentStatus" = 'PENDING';

UPDATE "Order"
SET "paymentStatus" = 'CANCELLED',
    "paymentStockRestoredAt" = COALESCE("paymentStockRestoredAt", "updatedAt")
WHERE "status" = 'CANCELLED'
  AND "paymentStatus" = 'PENDING';
