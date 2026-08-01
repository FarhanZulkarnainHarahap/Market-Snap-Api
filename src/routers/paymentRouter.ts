import { Router } from "express";
import { getPaymentStatus, handleMidtransNotification, handleXenditInvoiceWebhook } from "../controllers/paymentController.js";
import { authenticate } from "../middleware/authRole.js";

export const paymentRouter = Router();

paymentRouter.post("/payments/midtrans/notification", handleMidtransNotification);
paymentRouter.post("/payments/xendit/invoice", handleXenditInvoiceWebhook);
paymentRouter.get("/payments/:orderNumber/status", authenticate, getPaymentStatus);

// Deprecated Midtrans notification alias kept for older dashboard configuration.
paymentRouter.post("/midtrans/notification", handleMidtransNotification);
