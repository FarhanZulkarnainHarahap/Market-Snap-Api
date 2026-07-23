const baseUrl = process.env.XENDIT_BASE_URL ?? "https://api.xendit.co";
const apiKey = process.env.XENDIT_SECRET_KEY ?? process.env.XENDIT_API_KEY ?? "";

export const xenditConfig = {
  baseUrl,
  callbackToken: process.env.XENDIT_CALLBACK_TOKEN ?? "",
  hasSecretKey: Boolean(apiKey)
};

export async function xenditFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
      ...init?.headers
    }
  });
  if (!response.ok) throw new Error(`Xendit request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export type XenditInvoice = {
  id: string;
  external_id: string;
  invoice_url: string;
  status: string;
  amount: number;
};

export async function createXenditInvoice(input: { orderNumber: string; amount: number; payerEmail: string; description: string; paymentChannels?: string[] }) {
  return xenditFetch<XenditInvoice>("/v2/invoices", {
    method: "POST",
    body: JSON.stringify({
      external_id: input.orderNumber,
      amount: input.amount,
      payer_email: input.payerEmail,
      description: input.description,
      payment_methods: input.paymentChannels?.length ? input.paymentChannels : undefined,
      invoice_duration: 3600
    })
  });
}
