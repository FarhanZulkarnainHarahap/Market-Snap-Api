import { Router } from "express";
import { createOrder, deleteOrder, getOrders, updateOrder, updateOrderStatus, uploadPayment } from "../controllers/orderController.js";
import { authenticate, onlyAdmin, onlyUser } from "../middleware/authRole.js";
import { createOrderSchema, updateOrderSchema, updateOrderStatusSchema } from "../middleware/schemas.js";
import { uploadPaymentProof } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";

export const orderRouter = Router();

orderRouter.post("/orders", ...onlyUser, validate(createOrderSchema), createOrder);
orderRouter.get("/orders", authenticate, getOrders);
orderRouter.post("/orders/:id/payment-proof", ...onlyUser, uploadPaymentProof.single("paymentProof"), uploadPayment);
orderRouter.patch("/orders/:id", authenticate, validate(updateOrderSchema), updateOrder);
orderRouter.patch("/orders/:id/status", ...onlyAdmin, validate(updateOrderStatusSchema), updateOrderStatus);
orderRouter.delete("/orders/:id", authenticate, deleteOrder);
