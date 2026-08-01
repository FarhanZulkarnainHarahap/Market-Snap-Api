ALTER TABLE "Product"
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "brand" TEXT,
  ADD COLUMN "shortInfo" TEXT,
  ADD COLUMN "storageInfo" TEXT,
  ADD COLUMN "weightGram" INTEGER,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
