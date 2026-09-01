import type { Request, Response } from "express";
import { logBusinessEvent } from "../config/logger.js";
import { prisma } from "../config/prisma.js";
import { handleControllerError } from "../utils/controllerHelpers.js";
import { isPaymentVerificationError, reconcileXenditInvoice } from "../services/payment.service.js";
import { createXenditInvoice, getXenditInvoice, isXenditPaymentUrl, verifyXenditCallbackToken, xenditConfig, type XenditInvoice } from "../services/xendit.service.js";

export async function createPayment(req: Request, res: Response): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: String(req.body.orderId) },
      include: { items: true, payments: { orderBy: { createdAt: "desc" }, take: 1 }, user: true }
    });
    if (!order || !canAccessOrder(req, order)) {
      res.status(404).json({ message: "Order tidak ditemukan." });
      return;
    }
    if (Number(req.body.amount) !== order.total) {
      res.status(409).json({ message: "Nominal pembayaran tidak cocok dengan total order." });
      return;
    }
    if (order.paymentStatus === "PAID") {
      res.status(409).json({ message: "Order ini sudah dibayar." });
      return;
    }
    if (!["PENDING_PAYMENT", "WAITING_PAYMENT"].includes(order.status) || !["UNPAID", "PENDING"].includes(order.paymentStatus)) {
      res.status(409).json({ message: "Order ini tidak dapat membuat sesi pembayaran baru." });
      return;
    }
    const existing = order.payments[0];
    if (existing?.status === "PENDING" && isXenditPaymentUrl(existing.paymentUrl)) {
      res.json({ invoice_id: existing.invoiceId, invoice_url: existing.paymentUrl });
      return;
    }
    if (order.xenditInvoiceId && isXenditPaymentUrl(order.paymentRedirectUrl)) {
      res.json({ invoice_id: order.xenditInvoiceId, invoice_url: order.paymentRedirectUrl });
      return;
    }
    if (!xenditConfig.isReady) {
      res.status(503).json({ message: xenditConfig.validationMessage });
      return;
    }

    const invoice = await createXenditInvoice({
      amount: order.total,
      customerEmail: order.user.email,
      customerName: order.user.name,
      description: `Pembayaran order ${order.orderNumber}`,
      externalId: order.orderNumber,
      items: [{ category: "ORDER", name: `Order ${order.orderNumber}`, price: order.total, quantity: 1 }]
    });
    if (!invoice.invoice_url || !isXenditPaymentUrl(invoice.invoice_url)) throw new Error("Xendit tidak mengembalikan URL pembayaran yang aman.");

    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: {
          paymentDeadline: invoice.expiry_date ? new Date(invoice.expiry_date) : new Date(Date.now() + xenditConfig.invoiceDurationSeconds * 1000),
          paymentExternalId: invoice.id,
          paymentInvoiceUrl: invoice.invoice_url,
          paymentMethod: "xendit",
          paymentProvider: "xendit",
          paymentRedirectUrl: invoice.invoice_url,
          paymentStatus: "PENDING",
          status: "PENDING_PAYMENT",
          xenditInvoiceId: invoice.id,
          xenditInvoiceStatus: invoice.status
        }
      }),
      prisma.payment.upsert({
        where: { invoiceId: invoice.id },
        create: { amount: order.total, invoiceId: invoice.id, orderId: order.id, paymentUrl: invoice.invoice_url, provider: "xendit", status: "PENDING" },
        update: { amount: order.total, paymentUrl: invoice.invoice_url, status: "PENDING" }
      })
    ]);

    res.status(201).json({ invoice_id: invoice.id, invoice_url: invoice.invoice_url });
  } catch (error) {
    handleControllerError(res, error);
  }
}

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
    const invoice = normalizeXenditWebhook(req.body);
    if (!invoice.external_id || !invoice.id || !invoice.status) {
      res.status(400).json({ message: "Payload webhook Xendit tidak valid." });
      return;
    }
    if ((invoice.status === "PAID" || invoice.status === "SETTLED") && xenditConfig.apiMode === "payment_session" && !invoice.payment_id) {
      res.status(400).json({ message: "Payment Session selesai tanpa payment reference yang valid." });
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

function normalizeXenditWebhook(payload: unknown): XenditInvoice {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : body;
  if (typeof data.payment_session_id !== "string") return body as XenditInvoice;
  const rawStatus = String(data.status ?? "");
  return {
    id: data.payment_session_id,
    payment_session_id: data.payment_session_id,
    external_id: String(data.reference_id ?? ""),
    amount: Number(data.amount),
    paid_amount: rawStatus === "COMPLETED" ? Number(data.amount) : undefined,
    status: rawStatus === "ACTIVE" ? "PENDING" : rawStatus === "COMPLETED" ? "PAID" : rawStatus === "CANCELED" ? "CANCELLED" : rawStatus,
    invoice_url: typeof data.payment_link_url === "string" ? data.payment_link_url : undefined,
    expiry_date: typeof data.expires_at === "string" ? data.expires_at : undefined,
    paid_at: rawStatus === "COMPLETED" && typeof data.updated === "string" ? data.updated : undefined,
    payment_id: typeof data.payment_id === "string" ? data.payment_id : undefined,
    currency: typeof data.currency === "string" ? data.currency : undefined
  };
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
