import { prisma } from "../src/config/prisma.js";

type Region = {
  code: string;
  name: string;
};

type StoreSeed = {
  city: string;
  id: string;
  isMain: boolean;
  latitude: number;
  longitude: number;
  name: string;
  radiusKm: number;
};

const WILAYAH_BASE_URL = (process.env.WILAYAH_API_BASE_URL ?? "https://wilayah.id/api").replace(/\/+$/, "");
const STORES_PER_DISTRICT = Math.max(1, Number(process.env.STORES_PER_DISTRICT ?? 3));
const DISTRICT_LIMIT = Number(process.env.INDONESIA_STORE_LIMIT_DISTRICTS ?? 0);
const INCLUDE_INVENTORY = process.env.SEED_INDONESIA_STORE_INVENTORY !== "false";
const STORE_BATCH_SIZE = 250;
const INVENTORY_BATCH_SIZE = 2000;

const provinceAnchors: Record<string, { lat: number; lng: number }> = {
  "11": { lat: 4.6951, lng: 96.7494 },
  "12": { lat: 2.1154, lng: 99.5451 },
  "13": { lat: -0.7399, lng: 100.8000 },
  "14": { lat: 0.2933, lng: 101.7068 },
  "15": { lat: -1.6101, lng: 103.6131 },
  "16": { lat: -3.3194, lng: 103.9144 },
  "17": { lat: -3.7928, lng: 102.2608 },
  "18": { lat: -4.5586, lng: 105.4068 },
  "19": { lat: -2.7411, lng: 106.4406 },
  "21": { lat: 3.9457, lng: 108.1429 },
  "31": { lat: -6.2088, lng: 106.8456 },
  "32": { lat: -6.9175, lng: 107.6191 },
  "33": { lat: -7.1500, lng: 110.1403 },
  "34": { lat: -7.8754, lng: 110.4262 },
  "35": { lat: -7.5361, lng: 112.2384 },
  "36": { lat: -6.4058, lng: 106.0640 },
  "51": { lat: -8.4095, lng: 115.1889 },
  "52": { lat: -8.6529, lng: 117.3616 },
  "53": { lat: -8.6574, lng: 121.0794 },
  "61": { lat: -0.2788, lng: 111.4753 },
  "62": { lat: -1.6815, lng: 113.3824 },
  "63": { lat: -3.0926, lng: 115.2838 },
  "64": { lat: 0.5387, lng: 116.4194 },
  "65": { lat: 3.0731, lng: 116.0414 },
  "71": { lat: 1.4931, lng: 124.8413 },
  "72": { lat: -1.4300, lng: 121.4456 },
  "73": { lat: -3.6688, lng: 119.9741 },
  "74": { lat: -4.1449, lng: 122.1746 },
  "75": { lat: 0.6999, lng: 122.4467 },
  "76": { lat: -2.8441, lng: 119.2321 },
  "81": { lat: -3.2385, lng: 130.1453 },
  "82": { lat: 1.570999, lng: 127.808769 },
  "91": { lat: -4.2699, lng: 138.0804 },
  "92": { lat: -1.3361, lng: 133.1747 },
  "93": { lat: -4.0000, lng: 139.5000 },
  "94": { lat: -3.9886, lng: 136.9000 },
  "95": { lat: -4.1000, lng: 138.9500 },
  "96": { lat: -1.4000, lng: 132.9000 },
  "97": { lat: -1.2000, lng: 132.3000 }
};

async function main() {
  console.log(`Loading Indonesian regions from ${WILAYAH_BASE_URL}`);
  const products = INCLUDE_INVENTORY ? await prisma.product.findMany({ select: { id: true } }) : [];
  const provinces = await fetchRegions(`${WILAYAH_BASE_URL}/provinces.json`);
  let processedDistricts = 0;
  let createdStores = 0;

  for (const province of provinces) {
    const regencies = await fetchRegions(`${WILAYAH_BASE_URL}/regencies/${province.code}.json`);
    for (const regency of regencies) {
      const districts = await fetchRegions(`${WILAYAH_BASE_URL}/districts/${regency.code}.json`);
      for (const district of districts) {
        if (DISTRICT_LIMIT && processedDistricts >= DISTRICT_LIMIT) break;
        const stores = storesForDistrict({ district, province, regency });
        await upsertStores(stores);
        if (INCLUDE_INVENTORY && products.length) await seedInventory(stores.map((store) => store.id), products.map((product) => product.id));
        processedDistricts += 1;
        createdStores += stores.length;
      }
      if (DISTRICT_LIMIT && processedDistricts >= DISTRICT_LIMIT) break;
    }
    console.log(`${province.name}: processed ${processedDistricts} districts, upserted ${createdStores} stores so far.`);
    if (DISTRICT_LIMIT && processedDistricts >= DISTRICT_LIMIT) break;
  }

  console.log(`Done. Upserted ${createdStores} Market Snap stores for ${processedDistricts} districts.`);
}

async function fetchRegions(url: string): Promise<Region[]> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Gagal memuat wilayah: ${response.status} ${url}`);
  const body = await response.json() as unknown;
  const rows = Array.isArray(body) ? body : Array.isArray((body as { data?: unknown }).data) ? (body as { data: unknown[] }).data : [];
  return rows.map((row) => {
    const item = row as { code?: unknown; id?: unknown; name?: unknown };
    return { code: String(item.code ?? item.id ?? ""), name: titleCase(String(item.name ?? "")) };
  }).filter((item) => item.code && item.name);
}

function storesForDistrict(input: { district: Region; province: Region; regency: Region }): StoreSeed[] {
  return Array.from({ length: STORES_PER_DISTRICT }, (_, index) => {
    const point = pointForStore(input.province.code, input.regency.code, input.district.code, index);
    const area = `${input.district.name}, ${input.regency.name}, ${input.province.name}`;
    const suffix = ["Fresh Hub", "Express", "Daily"][index] ?? `Cabang ${index + 1}`;
    return {
      city: area,
      id: `id-${input.district.code.replaceAll(".", "-")}-${index + 1}`,
      isMain: input.district.code === "31.71.03" && index === 0,
      latitude: point.lat,
      longitude: point.lng,
      name: `Market Snap ${input.district.name} ${suffix}`,
      radiusKm: index === 0 ? 8 : index === 1 ? 6 : 5
    };
  });
}

async function upsertStores(stores: StoreSeed[]) {
  for (const chunk of chunks(stores, STORE_BATCH_SIZE)) {
    await prisma.$transaction(chunk.map((store) => prisma.store.upsert({
      where: { id: store.id },
      update: {
        city: store.city,
        isMain: store.isMain,
        latitude: store.latitude,
        longitude: store.longitude,
        name: store.name,
        radiusKm: store.radiusKm
      },
      create: store
    })));
  }
}

async function seedInventory(storeIds: string[], productIds: string[]) {
  const rows = storeIds.flatMap((storeId) => productIds.map((productId) => ({
    storeId,
    productId,
    quantity: deterministicStock(storeId, productId)
  })));

  for (const chunk of chunks(rows, INVENTORY_BATCH_SIZE)) {
    await prisma.inventory.createMany({ data: chunk, skipDuplicates: true });
  }
}

function pointForStore(provinceCode: string, regencyCode: string, districtCode: string, storeIndex: number) {
  const anchor = provinceAnchors[provinceCode] ?? { lat: -2.5, lng: 118 };
  const regencySeed = numericSeed(regencyCode);
  const districtSeed = numericSeed(districtCode);
  const ring = 0.05 + (storeIndex * 0.018);
  const latOffset = (((districtSeed % 240) - 120) / 120) * 0.72 + Math.sin(regencySeed + storeIndex) * ring;
  const lngOffset = ((((Math.floor(districtSeed / 7) % 240) - 120) / 120) * 0.9) + Math.cos(regencySeed + storeIndex) * ring;
  return {
    lat: Number((anchor.lat + latOffset).toFixed(6)),
    lng: Number((anchor.lng + lngOffset).toFixed(6))
  };
}

function deterministicStock(storeId: string, productId: string) {
  const seed = numericSeed(`${storeId}:${productId}`);
  if (seed % 19 === 0) return 0;
  if (seed % 11 === 0) return 3;
  return 12 + (seed % 54);
}

function numericSeed(value: string) {
  return value.split("").reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 17), 0);
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
