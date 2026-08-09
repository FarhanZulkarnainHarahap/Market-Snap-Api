ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PICKING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PACKED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'UNPAID';

ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';
ALTER TABLE "Order" ALTER COLUMN "paymentStatus" SET DEFAULT 'UNPAID';

ALTER TABLE "Inventory"
  ADD COLUMN IF NOT EXISTS "reservedQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "stockReservedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "stockCommittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "stockReleasedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "invoiceCreatedAt" TIMESTAMP(3);

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "productName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "sku" TEXT,
  ADD COLUMN IF NOT EXISTS "discount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "finalPrice" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "subtotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_invoiceNumber_key" ON "Order"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "Inventory_storeId_quantity_idx" ON "Inventory"("storeId", "quantity");
CREATE INDEX IF NOT EXISTS "Inventory_productId_idx" ON "Inventory"("productId");
CREATE INDEX IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_storeId_status_createdAt_idx" ON "Order"("storeId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");

UPDATE "OrderItem"
SET
  "productName" = COALESCE(NULLIF("productName", ''), "Product"."name"),
  "sku" = COALESCE("OrderItem"."sku", "Product"."sku"),
  "finalPrice" = CASE WHEN "OrderItem"."finalPrice" = 0 THEN "OrderItem"."price" ELSE "OrderItem"."finalPrice" END,
  "subtotal" = CASE WHEN "OrderItem"."subtotal" = 0 THEN "OrderItem"."price" * "OrderItem"."quantity" ELSE "OrderItem"."subtotal" END,
  "imageUrl" = COALESCE("OrderItem"."imageUrl", "ProductImage"."url")
FROM "Product"
LEFT JOIN LATERAL (
  SELECT "url"
  FROM "ProductImage"
  WHERE "ProductImage"."productId" = "Product"."id"
  ORDER BY "ProductImage"."id" ASC
  LIMIT 1
) "ProductImage" ON TRUE
WHERE "OrderItem"."productId" = "Product"."id";
