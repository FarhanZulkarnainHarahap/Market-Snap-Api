import type { Request, Response } from "express";
import { logBusinessEvent } from "../config/logger.js";
import { prisma } from "../config/prisma.js";
import { handleControllerError } from "../utils/controllerHelpers.js";
import { isPaymentVerificationError, reconcileXenditInvoice } from "../services/payment.service.js";
import { getXenditInvoice, verifyXenditCallbackToken, xenditConfig, type XenditInvoice } from "../services/xendit.service.js";

export async function getPaymentStatus(req: Request, res: Response): Promise<void> {
  try {
    const orderNumber = String(req.params.orderNumber ?? "");
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        storeId: true,
        total: true,
        paymentChannel: true,
        paymentDeadline: true,
        paymentMethod: true,
        paymentProvider: true,
        paymentRedirectUrl: true,
        paymentStatus: true,
        status: true,
        paidAt: true,
        xenditInvoiceId: true,
        xenditInvoiceStatus: true
      }
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
      paymentChannel: order.paymentChannel,
      paymentDeadline: order.paymentDeadline,
      paymentMethod: order.paymentMethod,
      paymentRedirectUrl: order.paymentRedirectUrl,
      paymentStatus: order.paymentStatus,
      total: order.total,
      transactionStatus: order.xenditInvoiceStatus
    };

    if ((order.paymentProvider === "xendit" || order.paymentMethod === "xendit") && order.xenditInvoiceId && xenditConfig.hasSecretKey) {
      try {
        const latest = await getXenditInvoice(order.xenditInvoiceId);
        const reconciled = await reconcileXenditInvoice({ orderNumber: order.orderNumber, invoice: latest });
        if (reconciled) result = reconciled;
      } catch (error) {
        if (isPaymentVerificationError(error)) throw error;
        logBusinessEvent("PAYMENT_STATUS_REFRESH_FAILED", {
          invoiceId: order.xenditInvoiceId,
          orderNumber: order.orderNumber,
          reason: error instanceof Error ? error.message : "Status Xendit gagal diperbarui."
        });
      }
    }

    res.json({ data: paymentStatusPayload(result) });
  } catch (error) {
    if (isPaymentVerificationError(error)) {
      res.status(409).json({ message: error.message, code: "PAYMENT_VERIFICATION_FAILED" });
      return;
    }
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
      res.status(400).json({ message: "Payload webhook Xendit tidak valid." });
      return;
    }
    logBusinessEvent("PAYMENT_WEBHOOK_RECEIVED", { invoiceId: invoice.id, externalId: invoice.external_id, status: invoice.status });
    const result = await reconcileXenditInvoice({ orderNumber: invoice.external_id, invoice });
    if (!result) {
      res.json({ message: "Webhook Xendit diterima, order belum ditemukan." });
      return;
    }
    res.json({ message: "Webhook Xendit diproses.", data: paymentStatusPayload(result) });
  } catch (error) {
    if (isPaymentVerificationError(error)) {
      res.status(409).json({ message: error.message, code: "PAYMENT_VERIFICATION_FAILED" });
      return;
    }
    handleControllerError(res, error);
  }
}

function paymentStatusPayload(result: {
  id: string;
  invoiceAvailable: boolean;
  orderNumber: string;
  orderStatus: string;
  paidAt: Date | null;
  paymentChannel: string | null;
  paymentDeadline: Date | null;
  paymentMethod: string | null;
  paymentRedirectUrl: string | null;
  paymentStatus: string;
  total: number;
  transactionStatus: string | null;
}) {
  return {
    id: result.id,
    orderNumber: result.orderNumber,
    orderStatus: result.orderStatus,
    paymentStatus: result.paymentStatus,
    transactionStatus: result.transactionStatus,
    paidAt: result.paidAt?.toISOString() ?? null,
    invoiceAvailable: result.invoiceAvailable,
    paymentRedirectUrl: result.paymentRedirectUrl,
    paymentDeadline: result.paymentDeadline?.toISOString() ?? null,
    paymentMethod: result.paymentMethod,
    paymentChannel: result.paymentChannel,
    total: result.total
  };
}

function canAccessOrder(req: Request, order: { storeId: string; userId: string }) {
  if (req.user?.role === "super_admin") return true;
  if (req.user?.role === "store_admin") return Boolean(req.user.storeId && req.user.storeId === order.storeId);
  return req.user?.id === order.userId;
}
