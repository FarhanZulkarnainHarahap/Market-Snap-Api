const baseUrl = (process.env.XENDIT_BASE_URL ?? "https://api.xendit.co").replace(/\/+$/, "");
const secretKey = process.env.XENDIT_SECRET_KEY ?? "";
const callbackToken = process.env.XENDIT_CALLBACK_TOKEN ?? "";
const webOrigin = normalizeUrl(process.env.WEB_ORIGIN ?? "http://localhost:3000");

export const xenditConfig = {
  baseUrl,
  callbackTokenConfigured: Boolean(callbackToken),
  hasSecretKey: Boolean(secretKey),
  validationMessage: secretKey ? "" : "Konfigurasi Xendit belum lengkap. XENDIT_SECRET_KEY wajib diisi.",
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
  return xenditFetch<XenditInvoice>("/v2/invoices", {
    method: "POST",
    body: JSON.stringify({
      external_id: input.externalId,
      amount: input.amount,
      description: input.description,
      invoice_duration: Number(process.env.XENDIT_INVOICE_DURATION_SECONDS ?? 3600),
      payer_email: input.customerEmail || undefined,
      customer: {
        given_names: input.customerName || "Market Snap Customer",
        email: input.customerEmail || undefined
      },
      success_redirect_url: `${webOrigin}/payment/finish?order_id=${encodeURIComponent(input.externalId)}`,
      failure_redirect_url: `${webOrigin}/payment/error?order_id=${encodeURIComponent(input.externalId)}`,
      currency: "IDR",
      items: input.items,
      metadata: {
        orderNumber: input.externalId,
        source: "market-snap"
      }
    })
  });
}

export async function getXenditInvoice(invoiceId: string) {
  if (!invoiceId.trim()) throw new Error("Invoice ID Xendit wajib diisi.");
  return xenditFetch<XenditInvoice>(`/v2/invoices/${encodeURIComponent(invoiceId)}`, { method: "GET" });
}

export function verifyXenditCallbackToken(token?: string | string[]) {
  if (!callbackToken) return true;
  return token === callbackToken;
}

async function xenditFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!secretKey) throw new Error(xenditConfig.validationMessage);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.XENDIT_TIMEOUT_MS ?? 10000));
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
        "content-type": "application/json",
        ...init?.headers
      }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(xenditErrorMessage(detail) || "Pembayaran Xendit belum dapat diproses.");
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Koneksi Xendit melewati batas waktu.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function xenditErrorMessage(detail: string) {
  if (!detail) return "";
  try {
    const parsed = JSON.parse(detail) as { message?: string; error_code?: string };
    return parsed.message ?? parsed.error_code ?? "";
  } catch {
    return detail.slice(0, 180);
  }
}

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}
