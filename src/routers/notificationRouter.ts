import { Router } from "express";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../controllers/notificationController.js";
import { authenticate } from "../middleware/authRole.js";

export const notificationRouter = Router();

notificationRouter.get("/notifications", authenticate, getNotifications);
notificationRouter.patch("/notifications/read-all", authenticate, markAllNotificationsRead);
notificationRouter.patch("/notifications/:id/read", authenticate, markNotificationRead);
