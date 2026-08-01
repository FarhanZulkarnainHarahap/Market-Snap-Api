import { Router } from "express";
import { getPaymentStatus, handleXenditInvoiceWebhook } from "../controllers/paymentController.js";
import { authenticate } from "../middleware/authRole.js";

export const paymentRouter = Router();

paymentRouter.post("/payments/xendit/invoice", handleXenditInvoiceWebhook);
paymentRouter.get("/payments/:orderNumber/status", authenticate, getPaymentStatus);
