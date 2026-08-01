import { createHash, timingSafeEqual } from "crypto";

const isProduction = String(process.env.MIDTRANS_IS_PRODUCTION ?? "false").toLowerCase() === "true";
const defaultBaseUrl = isProduction ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
const baseUrl = process.env.MIDTRANS_BASE_URL ?? defaultBaseUrl;
const defaultApiBaseUrl = isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
const apiBaseUrl = process.env.MIDTRANS_API_BASE_URL ?? defaultApiBaseUrl;
const clientKey = (isProduction ? process.env.MIDTRANS_CLIENT_KEY : process.env.MIDTRANS_SANDBOX_CLIENT_KEY ?? process.env.MIDTRANS_CLIENT_KEY) ?? "";
const serverKey = (isProduction ? process.env.MIDTRANS_SERVER_KEY : process.env.MIDTRANS_SANDBOX_SERVER_KEY ?? process.env.MIDTRANS_SERVER_KEY) ?? "";
const webOrigin = normalizeUrl(process.env.WEB_ORIGIN ?? "http://localhost:3000");

export const midtransConfig = {
  apiBaseUrl,
  baseUrl,
  clientKey,
  hasServerKey: Boolean(serverKey),
  isKeyModeValid: !midtransConfigError(),
  isProduction,
  merchantId: process.env.MIDTRANS_MERCHANT_ID ?? "",
  validationMessage: midtransConfigError(),
  webOrigin
};

export type MidtransSnapTransaction = {
  redirect_url: string;
  token: string;
};

export type MidtransTransactionStatus = {
  currency?: string;
  fraud_status?: string;
  gross_amount?: string;
  order_id: string;
  payment_type?: string;
  signature_key?: string;
  status_code?: string;
  transaction_id?: string;
  transaction_status?: string;
  transaction_time?: string;
  expiry_time?: string;
};

type MidtransItemDetail = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

export async function midtransFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return midtransRequest<T>(`${baseUrl}${path}`, init);
}

export async function getMidtransTransactionStatus(orderId: string): Promise<MidtransTransactionStatus> {
  if (!orderId.trim()) throw new Error("Order ID Midtrans wajib diisi.");
  return midtransRequest<MidtransTransactionStatus>(`${apiBaseUrl}/v2/${encodeURIComponent(orderId)}/status`, { method: "GET" });
}

async function midtransRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const configError = midtransConfigError();
  if (configError) throw new Error(configError);

  const auth = Buffer.from(`${serverKey}:`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.MIDTRANS_TIMEOUT_MS ?? 10000));
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
        ...init?.headers
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Koneksi Midtrans melewati batas waktu.");
    throw new Error("Midtrans belum dapat dihubungi.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const midtransMessage = midtransErrorMessage(detail);

    console.error("Midtrans request failed", {
      status: response.status,
      detail: midtransMessage || response.statusText,
      isProduction
    });

    throw new Error(
      midtransMessage
        ? `Pembayaran Midtrans gagal: ${midtransMessage}`
        : "Pembayaran belum dapat diproses. Periksa konfigurasi Midtrans.",
    );
  }

  return response.json() as Promise<T>;
}

function midtransConfigError(): string {
  if (!serverKey) return "Konfigurasi Midtrans belum lengkap. MIDTRANS_SERVER_KEY wajib diisi.";
  if (!isProduction && serverKey.startsWith("Mid-server-")) {
    return "Konfigurasi Midtrans sandbox salah. MIDTRANS_SERVER_KEY production terpasang di endpoint sandbox. Pakai Server Key sandbox yang cocok dengan dashboard sandbox.";
  }
  return "";
}

function midtransErrorMessage(detail: string): string {
  if (!detail) return "";
  try {
    const parsed = JSON.parse(detail) as { error_messages?: unknown };
    if (Array.isArray(parsed.error_messages)) return parsed.error_messages.map(String).join(" ");
  } catch {
    return detail.slice(0, 180);
  }
  return detail.slice(0, 180);
}

export async function createMidtransSnapTransaction(input: {
  amount: number;
  customerName?: string;
  itemDetails?: MidtransItemDetail[];
  orderNumber: string;
  payerEmail: string;
  paymentChannel?: string;
}) {
  return midtransFetch<MidtransSnapTransaction>("/snap/v1/transactions", {
    method: "POST",
    body: JSON.stringify({
      transaction_details: {
        gross_amount: input.amount,
        order_id: input.orderNumber
      },
      credit_card: {
        secure: true
      },
      customer_details: {
        email: input.payerEmail || undefined,
        first_name: input.customerName || "Market Snap Customer"
      },
      enabled_payments: input.paymentChannel ? [input.paymentChannel] : undefined,
      item_details: input.itemDetails?.length ? input.itemDetails : undefined,
      expiry: {
        duration: 1,
        unit: "hour"
      },
      callbacks: {
        finish: `${webOrigin}/payment/finish`
      }
    })
  });
}

export function verifyMidtransSignature(input: { grossAmount?: string; orderId?: string; signatureKey?: string; statusCode?: string }) {
  if (!serverKey || !input.orderId || !input.statusCode || !input.grossAmount || !input.signatureKey) return false;
  const expected = createHash("sha512").update(`${input.orderId}${input.statusCode}${input.grossAmount}${serverKey}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(input.signatureKey, "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}
