import type { Prisma, StoreAdminRequest } from "../../prisma/generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import type { Request, Response } from "express";
import { handleControllerError, mapStore, mapUser, paginate } from "../utils/controllerHelpers.js";

const requestInclude = {
  assignedStore: true,
  requestedStore: true,
  reviewedBy: true,
  user: true
} satisfies Prisma.StoreAdminRequestInclude;

type StoreAdminRequestWithRelations = Prisma.StoreAdminRequestGetPayload<{ include: typeof requestInclude }>;

export async function getMyStoreAdminRequest(req: Request, res: Response): Promise<void> {
  try {
    const request = await prisma.storeAdminRequest.findFirst({
      include: requestInclude,
      orderBy: { createdAt: "desc" },
      where: { userId: String(req.user?.id) }
    });
    res.json({ data: request ? mapStoreAdminRequest(request) : null });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function createStoreAdminRequest(req: Request, res: Response): Promise<void> {
  try {
    const userId = String(req.user?.id);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ message: "User tidak ditemukan" });
      return;
    }
    if (user.role !== "CUSTOMER") {
      res.status(409).json({ message: "Akun ini sudah memiliki akses admin." });
      return;
    }
    if (!user.verifiedAt) {
      res.status(403).json({ message: "Verifikasi email terlebih dahulu sebelum mengajukan Store Admin." });
      return;
    }
    if (!user.phone) {
      res.status(422).json({ message: "Lengkapi nomor handphone di profil sebelum mengajukan Store Admin." });
      return;
    }

    const requestedStoreId = req.body.requestedStoreId ? String(req.body.requestedStoreId) : undefined;
    const requestedStore = requestedStoreId ? await prisma.store.findUnique({ where: { id: requestedStoreId } }) : null;
    if (requestedStoreId && !requestedStore) {
      res.status(404).json({ message: "Cabang yang dipilih tidak ditemukan." });
      return;
    }

    const pending = await prisma.storeAdminRequest.findFirst({ where: { status: "PENDING", userId } });
    if (pending) {
      res.status(409).json({ message: "Pengajuan Store Admin masih menunggu review." });
      return;
    }

    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.storeAdminRequest.create({
        data: {
          experience: req.body.experience || null,
          reason: String(req.body.reason).trim(),
          requestedStoreId,
          userId
        },
        include: requestInclude
      });
      const superAdmins = await tx.user.findMany({ select: { id: true }, where: { isActive: true, role: "SUPER_ADMIN" } });
      if (superAdmins.length) {
        await tx.notification.createMany({
          data: superAdmins.map((admin) => ({
            message: `${user.name} mengajukan akses Store Admin${requestedStore ? ` untuk ${requestedStore.name}` : ""}.`,
            referenceId: created.id,
            referenceType: "StoreAdminRequest",
            title: "Pengajuan Store Admin baru",
            type: "STORE_ADMIN_REQUEST",
            userId: admin.id
          }))
        });
      }
      await tx.auditLog.create({
        data: {
          action: "STORE_ADMIN_REQUEST_CREATED",
          actorId: userId,
          after: sanitizeRequest(created),
          entityId: created.id,
          entityType: "StoreAdminRequest",
          requestId: created.id
        }
      });
      return created;
    });

    res.status(201).json({ data: mapStoreAdminRequest(request), message: "Pengajuan Store Admin berhasil dikirim." });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function cancelMyStoreAdminRequest(req: Request, res: Response): Promise<void> {
  try {
    const userId = String(req.user?.id);
    const existing = await prisma.storeAdminRequest.findFirst({ where: { status: "PENDING", userId } });
    if (!existing) {
      res.status(404).json({ message: "Tidak ada pengajuan aktif untuk dibatalkan." });
      return;
    }
    const request = await prisma.$transaction(async (tx) => {
      const updated = await tx.storeAdminRequest.update({
        data: { status: "CANCELLED" },
        include: requestInclude,
        where: { id: existing.id }
      });
      await tx.auditLog.create({
        data: {
          action: "STORE_ADMIN_REQUEST_CANCELLED",
          actorId: userId,
          after: sanitizeRequest(updated),
          before: sanitizeRequest(existing),
          entityId: updated.id,
          entityType: "StoreAdminRequest",
          requestId: updated.id
        }
      });
      return updated;
    });
    res.json({ data: mapStoreAdminRequest(request), message: "Pengajuan berhasil dibatalkan." });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function listStoreAdminRequests(req: Request, res: Response): Promise<void> {
  try {
    const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const where: Prisma.StoreAdminRequestWhereInput = {
      ...(status && ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(status) ? { status: status as StoreAdminRequest["status"] } : {}),
      ...(search ? {
        OR: [
          { reason: { contains: search, mode: "insensitive" } },
          { user: { email: { contains: search, mode: "insensitive" } } },
          { user: { name: { contains: search, mode: "insensitive" } } }
        ]
      } : {})
    };
    const [requests, counts] = await Promise.all([
      prisma.storeAdminRequest.findMany({ include: requestInclude, orderBy: { createdAt: "desc" }, where }),
      prisma.storeAdminRequest.groupBy({ by: ["status"], _count: { _all: true } })
    ]);
    res.json({
      ...paginate(requests.map(mapStoreAdminRequest), req.query.page, req.query.limit),
      counts: counts.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.status]: item._count._all }), {})
    });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getStoreAdminRequestById(req: Request, res: Response): Promise<void> {
  try {
    const request = await prisma.storeAdminRequest.findUnique({ include: requestInclude, where: { id: String(req.params.id) } });
    if (!request) {
      res.status(404).json({ message: "Pengajuan tidak ditemukan." });
      return;
    }
    res.json({ data: mapStoreAdminRequest(request) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function approveStoreAdminRequest(req: Request, res: Response): Promise<void> {
  try {
    const actorId = String(req.user?.id);
    const id = String(req.params.id);
    const store = await prisma.store.findUnique({ where: { id: String(req.body.storeId) } });
    if (!store) {
      res.status(404).json({ message: "Cabang tujuan tidak ditemukan." });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.storeAdminRequest.findUnique({ include: requestInclude, where: { id } });
      if (!existing) return { error: "not-found" as const };
      if (existing.status !== "PENDING") return { error: "already-reviewed" as const };
      if (existing.user.role !== "CUSTOMER") return { error: "role-changed" as const };

      await tx.user.update({
        data: { role: "STORE_ADMIN", storeId: store.id },
        where: { id: existing.userId }
      });
      const updated = await tx.storeAdminRequest.update({
        data: {
          assignedStoreId: store.id,
          reviewedAt: new Date(),
          reviewedById: actorId,
          status: "APPROVED"
        },
        include: requestInclude,
        where: { id }
      });
      await tx.notification.create({
        data: {
          message: `Pengajuan Store Admin kamu disetujui untuk cabang ${store.name}.`,
          referenceId: updated.id,
          referenceType: "StoreAdminRequest",
          title: "Akses Store Admin disetujui",
          type: "STORE_ADMIN_REQUEST_APPROVED",
          userId: updated.userId
        }
      });
      await tx.auditLog.create({
        data: {
          action: "STORE_ADMIN_REQUEST_APPROVED",
          actorId,
          after: sanitizeRequest(updated),
          before: sanitizeRequest(existing),
          entityId: updated.id,
          entityType: "StoreAdminRequest",
          requestId: updated.id
        }
      });
      return { request: updated };
    });

    if ("error" in result) {
      const statusCode = result.error === "not-found" ? 404 : 409;
      const message = result.error === "not-found" ? "Pengajuan tidak ditemukan." : "Pengajuan sudah tidak dapat diproses.";
      res.status(statusCode).json({ message });
      return;
    }
    res.json({ data: mapStoreAdminRequest(result.request), message: "Pengajuan disetujui dan role user diperbarui." });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function rejectStoreAdminRequest(req: Request, res: Response): Promise<void> {
  try {
    const actorId = String(req.user?.id);
    const id = String(req.params.id);
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.storeAdminRequest.findUnique({ include: requestInclude, where: { id } });
      if (!existing) return { error: "not-found" as const };
      if (existing.status !== "PENDING") return { error: "already-reviewed" as const };
      const updated = await tx.storeAdminRequest.update({
        data: {
          rejectionReason: String(req.body.reason).trim(),
          reviewedAt: new Date(),
          reviewedById: actorId,
          status: "REJECTED"
        },
        include: requestInclude,
        where: { id }
      });
      await tx.notification.create({
        data: {
          message: `Pengajuan Store Admin kamu belum disetujui. Alasan: ${updated.rejectionReason}`,
          referenceId: updated.id,
          referenceType: "StoreAdminRequest",
          title: "Pengajuan Store Admin ditolak",
          type: "STORE_ADMIN_REQUEST_REJECTED",
          userId: updated.userId
        }
      });
      await tx.auditLog.create({
        data: {
          action: "STORE_ADMIN_REQUEST_REJECTED",
          actorId,
          after: sanitizeRequest(updated),
          before: sanitizeRequest(existing),
          entityId: updated.id,
          entityType: "StoreAdminRequest",
          requestId: updated.id
        }
      });
      return { request: updated };
    });

    if ("error" in result) {
      const statusCode = result.error === "not-found" ? 404 : 409;
      const message = result.error === "not-found" ? "Pengajuan tidak ditemukan." : "Pengajuan sudah tidak dapat diproses.";
      res.status(statusCode).json({ message });
      return;
    }
    res.json({ data: mapStoreAdminRequest(result.request), message: "Pengajuan ditolak." });
  } catch (error) {
    handleControllerError(res, error);
  }
}

function mapStoreAdminRequest(request: StoreAdminRequestWithRelations) {
  return {
    assignedStore: request.assignedStore ? mapStore(request.assignedStore) : null,
    createdAt: request.createdAt.toISOString(),
    experience: request.experience,
    id: request.id,
    reason: request.reason,
    rejectionReason: request.rejectionReason,
    requestedStore: request.requestedStore ? mapStore(request.requestedStore) : null,
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    reviewedBy: request.reviewedBy ? mapUser(request.reviewedBy) : null,
    status: request.status,
    updatedAt: request.updatedAt.toISOString(),
    user: mapUser(request.user)
  };
}

function sanitizeRequest(request: StoreAdminRequest) {
  return {
    assignedStoreId: request.assignedStoreId,
    id: request.id,
    rejectionReason: request.rejectionReason,
    requestedStoreId: request.requestedStoreId,
    reviewedById: request.reviewedById,
    status: request.status,
    userId: request.userId
  };
}
