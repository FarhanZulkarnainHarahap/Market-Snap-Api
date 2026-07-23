-- Extend address data without breaking existing rows.
ALTER TABLE "Address"
  ADD COLUMN "recipientName" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "province" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "note" TEXT;

-- Persist checkout decisions and payment/tracking metadata on orders.
ALTER TABLE "Order"
  ADD COLUMN "addressId" TEXT,
  ADD COLUMN "addressSnapshot" JSONB,
  ADD COLUMN "deliveryDate" TIMESTAMP(3),
  ADD COLUMN "deliverySlot" TEXT,
  ADD COLUMN "shippingMethod" TEXT,
  ADD COLUMN "shippingProvider" TEXT,
  ADD COLUMN "serviceFee" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "voucherId" TEXT,
  ADD COLUMN "voucherCode" TEXT,
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "paymentChannel" TEXT,
  ADD COLUMN "paymentInvoiceUrl" TEXT,
  ADD COLUMN "paymentExternalId" TEXT,
  ADD COLUMN "trackingNumber" TEXT,
  ADD COLUMN "courierName" TEXT,
  ADD COLUMN "estimatedArrival" TIMESTAMP(3),
  ADD COLUMN "orderNote" TEXT;

CREATE TABLE "OrderStatusHistory" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

ALTER TABLE "OrderStatusHistory"
  ADD CONSTRAINT "OrderStatusHistory_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VoucherUsage" (
  "id" TEXT NOT NULL,
  "voucherId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orderId" TEXT,
  "code" TEXT NOT NULL,
  "discount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoucherUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoucherUsage_userId_voucherId_idx" ON "VoucherUsage"("userId", "voucherId");
CREATE INDEX "VoucherUsage_orderId_idx" ON "VoucherUsage"("orderId");

ALTER TABLE "VoucherUsage"
  ADD CONSTRAINT "VoucherUsage_voucherId_fkey"
  FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VoucherUsage"
  ADD CONSTRAINT "VoucherUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VoucherUsage"
  ADD CONSTRAINT "VoucherUsage_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
