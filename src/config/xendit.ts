import { createHash, timingSafeEqual } from "node:crypto";
import { Xendit } from "xendit-node";

const baseUrl = (process.env.XENDIT_BASE_URL ?? "https://api.xendit.co").replace(/\/+$/, "");
const secretKey = process.env.XENDIT_SECRET_KEY?.trim() ?? "";
const callbackToken = process.env.XENDIT_CALLBACK_TOKEN?.trim() ?? "";
const webOrigin = normalizeUrl(process.env.WEB_ORIGIN ?? "http://localhost:3000");
const configuredInvoiceDuration = Number(process.env.XENDIT_INVOICE_DURATION_SECONDS ?? 3600);
const invoiceDurationSeconds = Number.isInteger(configuredInvoiceDuration) && configuredInvoiceDuration >= 60
  ? configuredInvoiceDuration
  : 3600;
const missingConfiguration = [
  !secretKey ? "XENDIT_SECRET_KEY" : "",
  !callbackToken ? "XENDIT_CALLBACK_TOKEN" : ""
].filter(Boolean);

export const xenditConfig = {
  baseUrl,
  callbackTokenConfigured: Boolean(callbackToken),
  hasSecretKey: Boolean(secretKey),
  invoiceDurationSeconds,
  isReady: Boolean(secretKey && callbackToken),
  validationMessage: missingConfiguration.length
    ? `Konfigurasi Xendit belum lengkap. ${missingConfiguration.join(" dan ")} wajib diisi.`
    : "",
  webOrigin
};

export type XenditInvoiceItem = {
  name: string;
  price: number;
  quantity: number;
  category?: string;
};

export type XenditInvoice = {
  id: string;
  external_id: string;
  amount: number;
  paid_amount?: number;
  status: "PENDING" | "PAID" | "SETTLED" | "EXPIRED" | string;
  invoice_url?: string;
  expiry_date?: string;
  paid_at?: string;
  payment_id?: string;
  payment_method?: string;
  payment_channel?: string;
  currency?: string;
};

export async function createXenditInvoice(input: {
  amount: number;
  customerEmail: string;
  customerName?: string;
  description: string;
  externalId: string;
  items: XenditInvoiceItem[];
}) {
  if (!xenditConfig.isReady) throw new Error(xenditConfig.validationMessage);
  try {
    const invoice = await xenditClient().Invoice.createInvoice({
      data: {
      externalId: input.externalId,
      amount: input.amount,
      description: input.description,
      invoiceDuration: invoiceDurationSeconds,
      payerEmail: input.customerEmail || undefined,
      customer: {
        givenNames: input.customerName || "Market Snap Customer",
        email: input.customerEmail || undefined
      },
      successRedirectUrl: `${webOrigin}/payment/finish?order_id=${encodeURIComponent(input.externalId)}`,
      failureRedirectUrl: `${webOrigin}/payment/error?order_id=${encodeURIComponent(input.externalId)}`,
      currency: "IDR",
      items: input.items,
      metadata: {
        orderNumber: input.externalId,
        source: "market-snap"
      }
    }});
    return normalizeSdkInvoice(invoice);
  } catch (error) {
    throw new Error(xenditErrorMessage(error));
  }
}

export async function getXenditInvoice(invoiceId: string) {
  if (!invoiceId.trim()) throw new Error("Invoice ID Xendit wajib diisi.");
  if (!secretKey) throw new Error(xenditConfig.validationMessage);
  try {
    const invoice = await xenditClient().Invoice.getInvoiceById({ invoiceId });
    return normalizeSdkInvoice(invoice);
  } catch (error) {
    throw new Error(xenditErrorMessage(error));
  }
}

export function verifyXenditCallbackToken(token?: string | string[]) {
  if (typeof token !== "string" || !token || !callbackToken) return false;
  return secureTokenEquals(callbackToken, token);
}

export function secureTokenEquals(expected: string, provided: string): boolean {
  if (!expected || !provided) return false;
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

export function isXenditPaymentUrl(value?: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "xendit.co" || host.endsWith(".xendit.co"));
  } catch {
    return false;
  }
}

function xenditClient(): Xendit {
  return new Xendit({ secretKey, xenditURL: baseUrl });
}

function normalizeSdkInvoice(invoice: {
  amount: number;
  expiryDate: Date;
  externalId: string;
  id?: string;
  invoiceUrl: string;
  paymentMethod?: unknown;
  status: unknown;
}): XenditInvoice {
  if (!invoice.id) throw new Error("Xendit tidak mengembalikan invoice ID.");
  return {
    amount: invoice.amount,
    expiry_date: invoice.expiryDate instanceof Date ? invoice.expiryDate.toISOString() : String(invoice.expiryDate),
    external_id: invoice.externalId,
    id: invoice.id,
    invoice_url: invoice.invoiceUrl,
    payment_method: typeof invoice.paymentMethod === "string" ? invoice.paymentMethod : undefined,
    status: String(invoice.status)
  };
}

function xenditErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "Koneksi Xendit melewati batas waktu.";
  return "Pembayaran Xendit belum dapat diproses. Silakan coba lagi.";
}

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}
