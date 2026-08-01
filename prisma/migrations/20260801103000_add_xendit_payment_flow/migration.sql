-- Add Xendit-specific payment metadata without removing existing Midtrans fields.
ALTER TABLE "Order"
  ADD COLUMN "paymentProvider" TEXT,
  ADD COLUMN "xenditInvoiceId" TEXT,
  ADD COLUMN "xenditInvoiceStatus" TEXT;

UPDATE "Order"
SET "paymentProvider" = COALESCE("paymentProvider", "paymentMethod")
WHERE "paymentProvider" IS NULL
  AND "paymentMethod" IS NOT NULL;
