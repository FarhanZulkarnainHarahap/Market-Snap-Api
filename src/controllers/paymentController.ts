import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { handleControllerError } from "../utils/controllerHelpers.js";
import { getMidtransTransactionStatus, midtransConfig, verifyMidtransSignature } from "../services/midtrans.service.js";
import { reconcileMidtransPayment, reconcileXenditInvoice } from "../services/payment.service.js";
import { getXenditInvoice, verifyXenditCallbackToken, xenditConfig, type XenditInvoice } from "../services/xendit.service.js";

type MidtransNotificationBody = {
  fraud_status?: string;
  gross_amount?: string;
  order_id?: string;
  payment_type?: string;
  signature_key?: string;
  status_code?: string;
  transaction_id?: string;
  transaction_status?: string;
};

export async function handleMidtransNotification(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as MidtransNotificationBody;
    if (!midtransConfig.hasServerKey) {
      res.status(503).json({ message: "Konfigurasi Midtrans belum lengkap." });
      return;
    }
    if (!body.order_id || !body.status_code || !body.gross_amount || !body.signature_key) {
      res.status(400).json({ message: "Payload notifikasi Midtrans tidak lengkap." });
      return;
    }
    if (!verifyMidtransSignature({ grossAmount: body.gross_amount, orderId: body.order_id, signatureKey: body.signature_key, statusCode: body.status_code })) {
      res.status(403).json({ message: "Signature Midtrans tidak valid." });
      return;
    }

    const latest = await getMidtransTransactionStatus(body.order_id);
    const result = await reconcileMidtransPayment({
      expectedGrossAmount: body.gross_amount,
      orderNumber: body.order_id,
      status: latest
    });
    if (!result) {
      res.status(404).json({ message: "Order tidak ditemukan." });
      return;
    }
    res.json({ message: "Notifikasi Midtrans diproses.", data: paymentStatusPayload(result) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getPaymentStatus(req: Request, res: Response): Promise<void> {
  try {
    const orderNumber = String(req.params.orderNumber ?? "");
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: { id: true, orderNumber: true, userId: true, storeId: true, total: true, paymentMethod: true, paymentProvider: true, paymentStatus: true, status: true, paidAt: true, midtransTransactionStatus: true, xenditInvoiceId: true, xenditInvoiceStatus: true }
    });
    if (!order || !canAccessOrder(req, order)) {
      res.status(404).json({ message: "Order tidak ditemukan." });
      return;
    }

    let result = {
      id: order.id,
      invoiceAvailable: order.paymentStatus === "PAID",
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      paidAt: order.paidAt,
      paymentStatus: order.paymentStatus,
      transactionStatus: order.midtransTransactionStatus ?? order.xenditInvoiceStatus
    };

    if ((order.paymentProvider === "xendit" || order.paymentMethod === "xendit") && order.xenditInvoiceId && xenditConfig.hasSecretKey) {
      const latest = await getXenditInvoice(order.xenditInvoiceId);
      const reconciled = await reconcileXenditInvoice({ orderNumber: order.orderNumber, invoice: latest });
      if (reconciled) result = reconciled;
    } else if (midtransConfig.hasServerKey) {
      const latest = await getMidtransTransactionStatus(order.orderNumber);
      const reconciled = await reconcileMidtransPayment({ orderNumber: order.orderNumber, status: latest });
      if (reconciled) result = reconciled;
    }

    res.json({ data: paymentStatusPayload(result) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function handleXenditInvoiceWebhook(req: Request, res: Response): Promise<void> {
  try {
    if (!verifyXenditCallbackToken(req.header("x-callback-token") ?? undefined)) {
      res.status(403).json({ message: "Callback token Xendit tidak valid." });
      return;
    }
    const invoice = req.body as XenditInvoice;
    if (!invoice.external_id || !invoice.id || !invoice.status) {
      res.json({ message: "Webhook Xendit test diterima." });
      return;
    }
    const result = await reconcileXenditInvoice({ orderNumber: invoice.external_id, invoice });
    if (!result) {
      res.status(404).json({ message: "Order tidak ditemukan." });
      return;
    }
    res.json({ message: "Webhook Xendit diproses.", data: paymentStatusPayload(result) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

function paymentStatusPayload(result: {
  id: string;
  invoiceAvailable: boolean;
  orderNumber: string;
  orderStatus: string;
  paidAt: Date | null;
  paymentStatus: string;
  transactionStatus: string | null;
}) {
  return {
    id: result.id,
    orderNumber: result.orderNumber,
    orderStatus: result.orderStatus,
    paymentStatus: result.paymentStatus,
    transactionStatus: result.transactionStatus,
    paidAt: result.paidAt?.toISOString() ?? null,
    invoiceAvailable: result.invoiceAvailable
  };
}

function canAccessOrder(req: Request, order: { storeId: string; userId: string }) {
  if (req.user?.role === "super_admin") return true;
  if (req.user?.role === "store_admin") return Boolean(req.user.storeId && req.user.storeId === order.storeId);
  return req.user?.id === order.userId;
}
