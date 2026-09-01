import { createHash, timingSafeEqual } from "node:crypto";
import { Xendit } from "xendit-node";

const baseUrl = (process.env.XENDIT_BASE_URL ?? "https://api.xendit.co").replace(/\/+$/, "");
const secretKey = process.env.XENDIT_SECRET_KEY?.trim() ?? "";
const callbackToken = process.env.XENDIT_CALLBACK_TOKEN?.trim() ?? "";
const webOrigin = normalizeUrl(process.env.XENDIT_RETURN_ORIGIN ?? process.env.WEB_ORIGIN?.split(",")[0] ?? "http://localhost:3000");
const apiMode = process.env.XENDIT_API_MODE === "legacy_invoice" ? "legacy_invoice" : "payment_session";
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
  apiMode,
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
  payment_session_id?: string;
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
  if (apiMode === "payment_session") return createPaymentSession(input);
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
  if (apiMode === "payment_session") return getPaymentSession(invoiceId);
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
    return url.protocol === "https:" && (
      host === "xendit.co" ||
      host.endsWith(".xendit.co") ||
      host === "xen.to" ||
      host === "dev.xen.to"
    );
  } catch {
    return false;
  }
}

function xenditClient(): Xendit {
  return new Xendit({ secretKey, xenditURL: baseUrl });
}

async function createPaymentSession(input: {
  amount: number;
  customerEmail: string;
  customerName?: string;
  description: string;
  externalId: string;
  items: XenditInvoiceItem[];
}): Promise<XenditInvoice> {
  assertHttpsReturnOrigin();
  const itemTotal = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const items = itemTotal === input.amount ? input.items : [{ name: `Pesanan ${input.externalId}`, price: input.amount, quantity: 1, category: "ORDER" }];
  const response = await xenditFetch("/sessions", {
    method: "POST",
    body: JSON.stringify({
      reference_id: input.externalId.slice(0, 64),
      session_type: "PAY",
      mode: "PAYMENT_LINK",
      amount: input.amount,
      currency: "IDR",
      country: "ID",
      customer: {
        reference_id: `market-snap-${createHash("sha256").update(input.customerEmail || input.externalId).digest("hex").slice(0, 24)}`,
        type: "INDIVIDUAL",
        email: input.customerEmail || undefined,
        individual_detail: { given_names: input.customerName || "Market Snap Customer" }
      },
      items: items.map((item, index) => ({
        reference_id: `${input.externalId}-${index + 1}`.slice(0, 255),
        name: item.name.slice(0, 255),
        type: item.category === "Shipping" || item.category === "Service Fee" ? "FEE" : "PHYSICAL_PRODUCT",
        category: (item.category || "GROCERY").slice(0, 255),
        net_unit_amount: item.price,
        quantity: item.quantity,
        currency: "IDR"
      })),
      capture_method: "AUTOMATIC",
      locale: "id",
      description: input.description.slice(0, 1000),
      expires_at: new Date(Date.now() + invoiceDurationSeconds * 1000).toISOString(),
      success_return_url: `${webOrigin}/payment/finish?order_id=${encodeURIComponent(input.externalId)}`,
      cancel_return_url: `${webOrigin}/payment/error?order_id=${encodeURIComponent(input.externalId)}`,
      metadata: { orderNumber: input.externalId, source: "market-snap" }
    })
  });
  return normalizePaymentSession(response);
}

async function getPaymentSession(sessionId: string): Promise<XenditInvoice> {
  return normalizePaymentSession(await xenditFetch(`/sessions/${encodeURIComponent(sessionId)}`));
}

async function xenditFetch(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
        ...init.headers
      }
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Xendit request failed (${response.status}): ${String(payload.message ?? payload.error_code ?? "unknown")}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePaymentSession(value: Record<string, unknown>): XenditInvoice {
  const id = String(value.payment_session_id ?? "");
  if (!id) throw new Error("Xendit tidak mengembalikan payment session ID.");
  const status = String(value.status ?? "ACTIVE");
  return {
    id,
    payment_session_id: id,
    external_id: String(value.reference_id ?? ""),
    amount: Number(value.amount),
    paid_amount: status === "COMPLETED" ? Number(value.amount) : undefined,
    status: status === "ACTIVE" ? "PENDING" : status === "COMPLETED" ? "PAID" : status === "CANCELED" ? "CANCELLED" : status,
    invoice_url: typeof value.payment_link_url === "string" ? value.payment_link_url : undefined,
    expiry_date: typeof value.expires_at === "string" ? value.expires_at : undefined,
    paid_at: status === "COMPLETED" && typeof value.updated === "string" ? value.updated : undefined,
    payment_id: typeof value.payment_id === "string" ? value.payment_id : undefined,
    currency: typeof value.currency === "string" ? value.currency : undefined
  };
}

function assertHttpsReturnOrigin() {
  if (new URL(webOrigin).protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("WEB_ORIGIN production wajib menggunakan HTTPS untuk Payment Session Xendit.");
  }
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
