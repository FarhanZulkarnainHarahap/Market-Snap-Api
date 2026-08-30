import { Router } from "express";
import { createPayment, getPaymentStatus, handleXenditInvoiceWebhook } from "../controllers/paymentController.js";
import { authenticate } from "../middleware/authRole.js";
import { createPaymentSchema } from "../middleware/schemas.js";
import { validate } from "../middleware/validate.js";

export const paymentRouter = Router();

paymentRouter.post("/payments/xendit/invoice", handleXenditInvoiceWebhook);
paymentRouter.post("/payment/xendit/callback", handleXenditInvoiceWebhook);
paymentRouter.post("/payment/create", authenticate, validate(createPaymentSchema), createPayment);
paymentRouter.get("/payments/:orderNumber/status", authenticate, getPaymentStatus);
