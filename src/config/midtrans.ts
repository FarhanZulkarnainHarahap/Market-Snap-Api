import { createHash, timingSafeEqual } from "crypto";

const isProduction = String(process.env.MIDTRANS_IS_PRODUCTION ?? "false").toLowerCase() === "true";
const defaultBaseUrl = isProduction ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
const baseUrl = process.env.MIDTRANS_BASE_URL ?? defaultBaseUrl;
const clientKey = process.env.MIDTRANS_CLIENT_KEY ?? "";
const serverKey = process.env.MIDTRANS_SERVER_KEY ?? "";

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
    if (process.env.NODE_ENV !== "production") {
      console.error("Midtrans request failed", response.status, detail);
    }
    throw new Error("Pembayaran belum dapat diproses. Periksa konfigurasi Midtrans.");
  }

  return response.json() as Promise<T>;
}

function midtransConfigError(): string {
  if (!serverKey) return "Konfigurasi Midtrans belum lengkap. MIDTRANS_SERVER_KEY wajib diisi.";
  const serverSandbox = serverKey.startsWith("SB-Mid-server-");
  const clientSandbox = !clientKey || clientKey.startsWith("SB-Mid-client-");
  if (!isProduction && (!serverSandbox || !clientSandbox)) {
    return "Mode Midtrans sandbox aktif, tetapi key bukan sandbox. Gunakan MIDTRANS_SERVER_KEY SB-Mid-server-* dan MIDTRANS_CLIENT_KEY SB-Mid-client-*.";
  }
  if (isProduction && (serverSandbox || clientSandbox)) {
    return "Mode Midtrans production aktif, tetapi key masih sandbox. Gunakan key production atau set MIDTRANS_IS_PRODUCTION=false.";
  }
  return "";
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
