import type { OrderStatus, PaymentStatus, Prisma } from "../../prisma/generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import type { XenditInvoice } from "./xendit.service.js";

export type PaymentReconcileResult = {
  id: string;
  invoiceAvailable: boolean;
  orderNumber: string;
  orderStatus: OrderStatus;
  paidAt: Date | null;
  paymentStatus: PaymentStatus;
  transactionStatus: string | null;
};

const finalFailureStatuses: PaymentStatus[] = ["FAILED", "EXPIRED", "CANCELLED"];

export async function reconcileXenditInvoice(input: { invoice: XenditInvoice; orderNumber: string }): Promise<PaymentReconcileResult | null> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { orderNumber: input.orderNumber },
      include: { items: true }
    });
    if (!order) return null;

    assertGrossAmountMatches(order.total, input.invoice.amount);
    const mapped = mapXenditInvoiceStatus(input.invoice.status);
    const metadata: Prisma.OrderUpdateInput = {
      paymentChannel: input.invoice.payment_channel ?? input.invoice.payment_method ?? undefined,
      paymentExternalId: input.invoice.id,
      paymentProvider: "xendit",
      xenditInvoiceId: input.invoice.id,
      xenditInvoiceStatus: input.invoice.status
    };

    if (!mapped || !shouldApplyPaymentStatus(order.paymentStatus, mapped.paymentStatus)) {
      const updated = await tx.order.update({
        where: { id: order.id },
        data: metadata,
        select: paymentResultSelect
      });
      return paymentResult(updated);
    }

    const now = new Date();
    const orderStatus = mapped.orderStatus ?? order.status;
    const paidAt = mapped.paymentStatus === "PAID" ? order.paidAt ?? transactionDate(input.invoice.paid_at) ?? now : order.paidAt;
    const paymentExpiredAt = mapped.paymentStatus === "EXPIRED" ? order.paymentExpiredAt ?? transactionDate(input.invoice.expiry_date) ?? now : order.paymentExpiredAt;
    const shouldRestoreStock = shouldRestoreOrderStock(order.paymentStatus, mapped.paymentStatus, order.paymentStockRestoredAt);

    if (shouldRestoreStock) {
      for (const item of order.items) {
        await tx.inventory.update({
          where: { storeId_productId: { storeId: order.storeId, productId: item.productId } },
          data: { quantity: { increment: item.quantity } }
        });
        await tx.stockJournal.create({
          data: {
            storeId: order.storeId,
            productId: item.productId,
            change: item.quantity,
            note: `Restore stok pembayaran ${order.orderNumber}`
          }
        });
      }
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        ...metadata,
        paidAt,
        paymentExpiredAt,
        paymentStatus: mapped.paymentStatus,
        paymentStockRestoredAt: shouldRestoreStock ? now : order.paymentStockRestoredAt,
        status: orderStatus
      },
      select: paymentResultSelect
    });

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
  if (status === "PENDING") return { paymentStatus: "PENDING", orderStatus: "WAITING_PAYMENT" };
  if (status === "PAID" || status === "SETTLED") return { paymentStatus: "PAID", orderStatus: "PROCESSING" };
  if (status === "EXPIRED") return { paymentStatus: "EXPIRED", orderStatus: "CANCELLED" };
  return null;
}

export function assertGrossAmountMatches(orderTotal: number, grossAmount: string | number | undefined): void {
  const gross = Number(grossAmount);
  if (!Number.isFinite(gross) || Math.round(gross) !== orderTotal) {
    throw new Error("Nominal pembayaran tidak cocok dengan total order.");
  }
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
    PENDING: 10,
    FAILED: 50,
    EXPIRED: 50,
    CANCELLED: 50,
    PAID: 60,
    REFUNDED: 70
  };
  return priorities[status];
}

function shouldRestoreOrderStock(current: PaymentStatus, next: PaymentStatus, restoredAt: Date | null): boolean {
  if (restoredAt) return false;
  if (!finalFailureStatuses.includes(next)) return false;
  if (current === "PAID" || current === "REFUNDED" || finalFailureStatuses.includes(current)) return false;
  return true;
}

function xenditHistoryDescription(paymentStatus: PaymentStatus, orderStatus: OrderStatus): string {
  if (paymentStatus === "PAID") return "Pembayaran Xendit berhasil dan pesanan masuk proses cabang.";
  if (paymentStatus === "EXPIRED") return "Invoice Xendit kedaluwarsa.";
  if (orderStatus === "WAITING_PAYMENT") return "Pesanan menunggu pembayaran Xendit.";
  return "Status pembayaran Xendit diperbarui.";
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
  paymentStatus: true,
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
    paymentStatus: order.paymentStatus,
    transactionStatus: order.xenditInvoiceStatus
  };
}
