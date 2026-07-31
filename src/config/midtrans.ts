import { createHash, timingSafeEqual } from "crypto";

const isProduction = String(process.env.MIDTRANS_IS_PRODUCTION ?? "false").toLowerCase() === "true";
const defaultBaseUrl = isProduction ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
const baseUrl = process.env.MIDTRANS_BASE_URL ?? defaultBaseUrl;
const clientKey = (isProduction ? process.env.MIDTRANS_CLIENT_KEY : process.env.MIDTRANS_SANDBOX_CLIENT_KEY ?? process.env.MIDTRANS_CLIENT_KEY) ?? "";
const serverKey = (isProduction ? process.env.MIDTRANS_SERVER_KEY : process.env.MIDTRANS_SANDBOX_SERVER_KEY ?? process.env.MIDTRANS_SERVER_KEY) ?? "";

export const midtransConfig = {
  baseUrl,
  clientKey,
  hasServerKey: Boolean(serverKey),
  isKeyModeValid: !midtransConfigError(),
  isProduction,
  merchantId: process.env.MIDTRANS_MERCHANT_ID ?? "",
  validationMessage: midtransConfigError()
};

export type MidtransSnapTransaction = {
  redirect_url: string;
  token: string;
};

type MidtransItemDetail = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

export async function midtransFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const configError = midtransConfigError();
  if (configError) throw new Error(configError);

  const auth = Buffer.from(`${serverKey}:`).toString("base64");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const midtransMessage = midtransErrorMessage(detail);

    console.error("Midtrans request failed", {
      status: response.status,
      detail,
      baseUrl,
      isProduction,
      hasServerKey: Boolean(serverKey),
      serverKeyPrefix: serverKey.slice(0, 6),
      serverKeyLength: serverKey.length,
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
