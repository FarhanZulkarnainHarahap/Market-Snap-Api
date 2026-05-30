const baseUrl = process.env.RAJAONGKIR_BASE_URL ?? "https://rajaongkir.komerce.id/api/v1";
const apiKey = process.env.RAJAONGKIR_API_KEY ?? "";

export const rajaongkirConfig = {
  baseUrl,
  originId: process.env.RAJAONGKIR_ORIGIN_ID ?? "",
  defaultCourier: process.env.RAJAONGKIR_DEFAULT_COURIER ?? "jne:jnt:sicepat",
  defaultWeightGram: Number(process.env.RAJAONGKIR_DEFAULT_WEIGHT_GRAM ?? 1000),
  hasApiKey: Boolean(apiKey)
};

export async function rajaongkirFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      key: apiKey,
      "content-type": "application/json",
      ...init?.headers
    }
  });
  if (!response.ok) throw new Error(`RajaOngkir request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function calculateDomesticShippingCost(input: { destinationId: string; courier?: string; weightGram?: number }) {
  const body = new URLSearchParams({
    origin: rajaongkirConfig.originId,
    destination: input.destinationId,
    weight: String(input.weightGram ?? rajaongkirConfig.defaultWeightGram),
    courier: input.courier ?? rajaongkirConfig.defaultCourier,
    price: "lowest"
  });
  const payload = await rajaongkirFetch<{ data?: unknown }>("/calculate/domestic-cost", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  return { cost: extractCost(payload.data), raw: payload.data };
}

function extractCost(data: unknown): number {
  if (typeof data === "number") return data;
  if (Array.isArray(data)) return data.map(extractCost).find((cost) => cost > 0) ?? 0;
  if (!data || typeof data !== "object") return 0;
  const record = data as Record<string, unknown>;
  const directCost = Number(record.cost ?? record.value ?? record.price ?? 0);
  return directCost > 0 ? directCost : extractCost(Object.values(record));
}
