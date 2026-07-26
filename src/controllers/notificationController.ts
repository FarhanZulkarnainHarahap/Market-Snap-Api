import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { handleControllerError } from "../utils/controllerHelpers.js";

export async function getNotifications(req: Request, res: Response): Promise<void> {
  try {
    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      where: { userId: String(req.user?.id) }
    });
    res.json({ data: notifications.map(mapNotification) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  try {
    const notification = await prisma.notification.updateMany({
      data: { isRead: true },
      where: { id: String(req.params.id), userId: String(req.user?.id) }
    });
    if (!notification.count) {
      res.status(404).json({ message: "Notifikasi tidak ditemukan." });
      return;
    }
    res.json({ message: "Notifikasi ditandai sudah dibaca." });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function markAllNotificationsRead(req: Request, res: Response): Promise<void> {
  try {
    await prisma.notification.updateMany({ data: { isRead: true }, where: { userId: String(req.user?.id), isRead: false } });
    res.json({ message: "Semua notifikasi ditandai sudah dibaca." });
  } catch (error) {
    handleControllerError(res, error);
  }
}

function mapNotification(notification: { createdAt: Date; id: string; isRead: boolean; message: string; referenceId: string | null; referenceType: string | null; title: string; type: string }) {
  return {
    createdAt: notification.createdAt.toISOString(),
    id: notification.id,
    isRead: notification.isRead,
    message: notification.message,
    referenceId: notification.referenceId,
    referenceType: notification.referenceType,
    title: notification.title,
    type: notification.type
  };
}
