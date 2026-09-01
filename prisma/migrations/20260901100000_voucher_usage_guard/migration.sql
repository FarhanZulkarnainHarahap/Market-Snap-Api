DELETE FROM "VoucherUsage" newer
USING "VoucherUsage" older
WHERE newer."userId" = older."userId"
  AND newer."voucherId" = older."voucherId"
  AND (newer."createdAt", newer."id") > (older."createdAt", older."id");

CREATE UNIQUE INDEX "VoucherUsage_userId_voucherId_key" ON "VoucherUsage"("userId", "voucherId");
