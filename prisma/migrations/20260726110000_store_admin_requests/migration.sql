CREATE TYPE "StoreAdminRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "StoreAdminRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestedStoreId" TEXT,
  "reason" TEXT NOT NULL,
  "experience" TEXT,
  "status" "StoreAdminRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "assignedStoreId" TEXT,
  "rejectionReason" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreAdminRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreAdminRequest_userId_status_idx" ON "StoreAdminRequest"("userId", "status");
CREATE INDEX "StoreAdminRequest_status_createdAt_idx" ON "StoreAdminRequest"("status", "createdAt");
CREATE INDEX "StoreAdminRequest_requestedStoreId_idx" ON "StoreAdminRequest"("requestedStoreId");
CREATE INDEX "StoreAdminRequest_assignedStoreId_idx" ON "StoreAdminRequest"("assignedStoreId");
CREATE UNIQUE INDEX "StoreAdminRequest_one_pending_per_user_idx" ON "StoreAdminRequest"("userId") WHERE "status" = 'PENDING';

ALTER TABLE "StoreAdminRequest"
  ADD CONSTRAINT "StoreAdminRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoreAdminRequest"
  ADD CONSTRAINT "StoreAdminRequest_requestedStoreId_fkey"
  FOREIGN KEY ("requestedStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StoreAdminRequest"
  ADD CONSTRAINT "StoreAdminRequest_assignedStoreId_fkey"
  FOREIGN KEY ("assignedStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StoreAdminRequest"
  ADD CONSTRAINT "StoreAdminRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "referenceId" TEXT,
  "referenceType" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");
CREATE INDEX "Notification_referenceId_referenceType_idx" ON "Notification"("referenceId", "referenceType");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
