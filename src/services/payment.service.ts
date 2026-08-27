import type { OrderStatus, PaymentStatus, Prisma } from "../../prisma/generated/prisma/client.js";
import { logBusinessEvent } from "../config/logger.js";
import { prisma } from "../config/prisma.js";
import type { XenditInvoice } from "./xendit.service.js";

export type PaymentReconcileResult = {
  id: string;
  invoiceAvailable: boolean;
  orderNumber: string;
  orderStatus: OrderStatus;
  paidAt: Date | null;
  paymentChannel: string | null;
  paymentDeadline: Date | null;
  paymentMethod: string | null;
  paymentRedirectUrl: string | null;
  paymentStatus: PaymentStatus;
  total: number;
  transactionStatus: string | null;
};

export class PaymentVerificationError extends Error {
  override readonly name = "PaymentVerificationError";
}

const finalFailureStatuses: PaymentStatus[] = ["FAILED", "EXPIRED", "CANCELLED"];

export async function reconcileXenditInvoice(input: { invoice: XenditInvoice; orderNumber: string }): Promise<PaymentReconcileResult | null> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Order"
      WHERE "orderNumber" = ${input.orderNumber}
      FOR UPDATE
    `;
    if (!locked[0]) return null;

    const order = await tx.order.findUnique({
      where: { id: locked[0].id },
      include: { items: true, store: true, user: true }
    });
    if (!order) return null;

    try {
      assertXenditInvoiceIdentity(order, input.invoice);
      assertXenditInvoiceAmount(order.total, input.invoice);
    } catch (error) {
      logBusinessEvent("PAYMENT_VERIFICATION_FAILED", {
        invoiceId: input.invoice.id,
        orderNumber: input.orderNumber,
        reason: error instanceof Error ? error.message : "Verifikasi pembayaran gagal."
      });
      throw error;
    }

    const mapped = mapXenditInvoiceStatus(input.invoice.status);
    const metadata: Prisma.OrderUpdateInput = {
      paymentChannel: input.invoice.payment_channel ?? input.invoice.payment_method ?? undefined,
      paymentExternalId: input.invoice.id,
      paymentProvider: "xendit",
      xenditInvoiceId: input.invoice.id,
      xenditInvoiceStatus: input.invoice.status
    };

    if (!mapped) {
      const updated = await tx.order.update({
        where: { id: order.id },
        data: metadata,
        select: paymentResultSelect
      });
      return paymentResult(updated);
    }

    if (!shouldApplyPaymentStatus(order.paymentStatus, mapped.paymentStatus)) {
      return paymentResult(order);
    }

    const now = new Date();
    const orderStatus = mapped.orderStatus ?? order.status;
    const paidAt = mapped.paymentStatus === "PAID" ? order.paidAt ?? transactionDate(input.invoice.paid_at) ?? now : order.paidAt;
    const paymentExpiredAt = mapped.paymentStatus === "EXPIRED" ? order.paymentExpiredAt ?? transactionDate(input.invoice.expiry_date) ?? now : order.paymentExpiredAt;
    const stockTransition = stockTransitionForPayment({
      committedAt: order.stockCommittedAt,
      current: order.paymentStatus,
      next: mapped.paymentStatus,
      releasedAt: order.stockReleasedAt,
      reservedAt: order.stockReservedAt
    });
    const shouldCommitStock = stockTransition === "COMMIT";
    const shouldReleaseStock = stockTransition === "RELEASE";

    if (shouldCommitStock) {
      for (const item of order.items) {
        const inventory = await tx.inventory.updateMany({
          where: {
            storeId: order.storeId,
            productId: item.productId,
            quantity: { gte: item.quantity },
            reservedQuantity: { gte: item.quantity }
          },
          data: { quantity: { decrement: item.quantity }, reservedQuantity: { decrement: item.quantity } }
        });
        if (inventory.count !== 1) throw new Error(`Reservasi stok ${item.productName || item.productId} tidak konsisten.`);
        await tx.stockJournal.create({
          data: {
            storeId: order.storeId,
            productId: item.productId,
            change: -item.quantity,
            note: `SALE ${order.orderNumber}`
          }
        });
      }
      logBusinessEvent("STOCK_COMMITTED", { orderId: order.id, orderNumber: order.orderNumber });
      logBusinessEvent("PAYMENT_PAID", { orderId: order.id, orderNumber: order.orderNumber, amount: order.total });
    }

    if (shouldReleaseStock) {
      for (const item of order.items) {
        const inventory = await tx.inventory.updateMany({
          where: {
            storeId: order.storeId,
            productId: item.productId,
            reservedQuantity: { gte: item.quantity }
          },
          data: { reservedQuantity: { decrement: item.quantity } }
        });
        if (inventory.count !== 1) throw new Error(`Reservasi stok ${item.productName || item.productId} tidak konsisten.`);
        await tx.stockJournal.create({
          data: {
            storeId: order.storeId,
            productId: item.productId,
            change: 0,
            note: `RELEASE ${item.quantity} unit ${order.orderNumber}`
          }
        });
      }
      await tx.voucherUsage.deleteMany({ where: { orderId: order.id } });
      logBusinessEvent("STOCK_RELEASED", { orderId: order.id, orderNumber: order.orderNumber, paymentStatus: mapped.paymentStatus });
    }

    const invoiceData = mapped.paymentStatus === "PAID" && !order.invoiceNumber
      ? createInvoiceData(order, paidAt ?? now, input.invoice)
      : null;

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        ...metadata,
        invoiceCreatedAt: invoiceData ? now : order.invoiceCreatedAt,
        invoiceNumber: invoiceData?.invoiceNumber ?? order.invoiceNumber,
        invoiceSnapshot: invoiceData ?? undefined,
        paidAt,
        paymentExpiredAt,
        paymentStatus: mapped.paymentStatus,
        paymentStockRestoredAt: shouldReleaseStock ? now : order.paymentStockRestoredAt,
        stockCommittedAt: shouldCommitStock ? now : order.stockCommittedAt,
        stockReleasedAt: shouldReleaseStock ? now : order.stockReleasedAt,
        status: orderStatus
      },
      select: paymentResultSelect
    });

    if (invoiceData) logBusinessEvent("INVOICE_CREATED", { invoiceNumber: invoiceData.invoiceNumber, orderId: order.id, orderNumber: order.orderNumber });

    if (order.status !== orderStatus) {
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: orderStatus,
          description: xenditHistoryDescription(mapped.paymentStatus, orderStatus)
        }
      });
    }

    return paymentResult(updated);
  });
}

export function mapXenditInvoiceStatus(status?: string): { orderStatus: OrderStatus | null; paymentStatus: PaymentStatus } | null {
  if (status === "PENDING") return { paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT" };
  if (status === "PAID" || status === "SETTLED") return { paymentStatus: "PAID", orderStatus: "PAID" };
  if (status === "EXPIRED") return { paymentStatus: "EXPIRED", orderStatus: "CANCELLED" };
  return null;
}

export function assertGrossAmountMatches(orderTotal: number, grossAmount: string | number | undefined): void {
  const gross = Number(grossAmount);
  if (!Number.isFinite(gross) || gross !== orderTotal) {
    throw new PaymentVerificationError("Nominal pembayaran tidak cocok dengan total order.");
  }
}

export function assertXenditInvoiceIdentity(
  order: { orderNumber: string; xenditInvoiceId: string | null },
  invoice: Pick<XenditInvoice, "external_id" | "id">
): void {
  if (!invoice.external_id || invoice.external_id !== order.orderNumber) {
    throw new PaymentVerificationError("External ID Xendit tidak cocok dengan nomor order.");
  }
  if (order.xenditInvoiceId && invoice.id !== order.xenditInvoiceId) {
    throw new PaymentVerificationError("Invoice ID Xendit tidak cocok dengan order.");
  }
}

export function assertXenditInvoiceAmount(orderTotal: number, invoice: Pick<XenditInvoice, "amount" | "paid_amount" | "status">): void {
  assertGrossAmountMatches(orderTotal, invoice.amount);
  if ((invoice.status === "PAID" || invoice.status === "SETTLED") && invoice.paid_amount !== undefined) {
    assertGrossAmountMatches(orderTotal, invoice.paid_amount);
  }
}

export function isPaymentVerificationError(error: unknown): error is PaymentVerificationError {
  return error instanceof PaymentVerificationError;
}

function shouldApplyPaymentStatus(current: PaymentStatus, next: PaymentStatus): boolean {
  if (current === next) return true;
  if (current === "REFUNDED") return false;
  if (current === "PAID") return next === "REFUNDED";
  if (finalFailureStatuses.includes(current)) return next === "REFUNDED";
  return paymentPriority(next) >= paymentPriority(current);
}

function paymentPriority(status: PaymentStatus): number {
  const priorities: Record<PaymentStatus, number> = {
    UNPAID: 0,
    PENDING: 10,
    FAILED: 50,
    EXPIRED: 50,
    CANCELLED: 50,
    PAID: 60,
    REFUNDED: 70
  };
  return priorities[status];
}

function shouldReleaseReservedStock(current: PaymentStatus, next: PaymentStatus, committedAt: Date | null, releasedAt: Date | null, reservedAt: Date | null): boolean {
  if (releasedAt || committedAt || !reservedAt) return false;
  if (!finalFailureStatuses.includes(next)) return false;
  if (current === "PAID" || current === "REFUNDED" || finalFailureStatuses.includes(current)) return false;
  return true;
}

export function stockTransitionForPayment(input: {
  committedAt: Date | null;
  current: PaymentStatus;
  next: PaymentStatus;
  releasedAt: Date | null;
  reservedAt: Date | null;
}): "COMMIT" | "RELEASE" | null {
  if (input.next === "PAID" && !input.committedAt && input.reservedAt && !input.releasedAt) return "COMMIT";
  if (shouldReleaseReservedStock(input.current, input.next, input.committedAt, input.releasedAt, input.reservedAt)) return "RELEASE";
  return null;
}

export function isFinalInvoiceAvailable(order: { invoiceNumber?: string | null; invoiceSnapshot?: unknown; paymentStatus: PaymentStatus }): boolean {
  return order.paymentStatus === "PAID" || Boolean(order.invoiceNumber && order.invoiceSnapshot);
}

function xenditHistoryDescription(paymentStatus: PaymentStatus, orderStatus: OrderStatus): string {
  if (paymentStatus === "PAID") return "Pembayaran Xendit berhasil dan pesanan masuk proses cabang.";
  if (paymentStatus === "EXPIRED") return "Invoice Xendit kedaluwarsa.";
  if (orderStatus === "PENDING_PAYMENT") return "Pesanan menunggu pembayaran Xendit.";
  return "Status pembayaran Xendit diperbarui.";
}

function createInvoiceData(order: Prisma.OrderGetPayload<{ include: { items: true; store: true; user: true } }>, paidAt: Date, invoice: XenditInvoice) {
  const invoiceNumber = invoiceNumberFor(order.orderNumber);
  const subtotal = order.items.reduce((sum, item) => sum + (item.subtotal || item.finalPrice * item.quantity || item.price * item.quantity), 0);
  return {
    invoiceNumber,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customer: {
      id: order.user.id,
      name: order.user.name,
      email: order.user.email,
      phone: order.user.phone
    },
    address: order.addressSnapshot,
    store: {
      id: order.store.id,
      name: order.store.name,
      city: order.store.city
    },
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.productName,
      sku: item.sku,
      image: item.imageUrl,
      quantity: item.quantity,
      price: item.price,
      unitPrice: item.finalPrice || item.price,
      discount: item.discount,
      finalPrice: item.finalPrice || item.price,
      subtotal: item.subtotal || item.price * item.quantity
    })),
    subtotal,
    discount: order.discountTotal,
    shippingCost: order.shippingCost,
    serviceFee: order.serviceFee,
    grandTotal: order.total,
    paymentMethod: order.paymentMethod,
    paymentChannel: invoice.payment_channel ?? invoice.payment_method ?? order.paymentChannel,
    paymentStatus: "PAID",
    orderStatus: "PAID",
    transactionId: invoice.id,
    paidAt: paidAt.toISOString(),
    createdAt: order.createdAt.toISOString()
  };
}

function invoiceNumberFor(orderNumber: string): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = orderNumber.replace(/^ORD-\d+-?/, "").replace(/[^A-Z0-9]/gi, "").slice(-6).toUpperCase();
  return `INV-${date}-${suffix || Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function transactionDate(value?: string): Date | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

const paymentResultSelect = {
  id: true,
  orderNumber: true,
  paidAt: true,
  paymentChannel: true,
  paymentDeadline: true,
  paymentMethod: true,
  paymentRedirectUrl: true,
  paymentStatus: true,
  total: true,
  xenditInvoiceStatus: true,
  status: true
} satisfies Prisma.OrderSelect;

function paymentResult(order: Prisma.OrderGetPayload<{ select: typeof paymentResultSelect }>): PaymentReconcileResult {
  return {
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
}
