import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { handleControllerError, locationFromQuery, mapStore, paginate } from "../utils/controllerHelpers.js";

export async function getNearestStore(req: Request, res: Response): Promise<void> {
  try {
    const result = await resolveStore(req.query);
    res.json({ ...result, serviceable: result.inRange });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getStores(_req: Request, res: Response): Promise<void> {
  try {
    const stores = await prisma.store.findMany({ orderBy: [{ isMain: "desc" }, { name: "asc" }] });
    res.json({ data: stores.map((store) => mapStore(store)) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getCategories(_req: Request, res: Response): Promise<void> {
  try {
    const categories = await prisma.productCategory.findMany({ orderBy: { name: "asc" } });
    res.json({ data: categories.map((category) => category.name) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getVouchers(_req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();
    const vouchers = await prisma.voucher.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }]
    });
    res.json({ data: vouchers });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getProducts(req: Request, res: Response): Promise<void> {
  try {
    const { store, inRange } = await resolveStore(req.query);
    const products = await filteredProducts(req, store.id);
    const sorted = sortProducts(products, String(req.query.sort ?? "featured"));
    res.json({ ...paginate(sorted, req.query.page, req.query.limit), store, serviceable: inRange });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getProductDetail(req: Request, res: Response): Promise<void> {
  try {
    const { store } = await resolveStore(req.query);
    const product = await prisma.product.findUnique({ where: { id: String(req.params.id) }, include: productInclude(store.id) });
    if (!product) {
      res.status(404).json({ message: "Produk tidak ditemukan" });
      return;
    }
    res.json({ data: mapProduct(product), store });
  } catch (error) {
    handleControllerError(res, error);
  }
}

async function resolveStore(query: Request["query"]) {
  const stores = await prisma.store.findMany();
  const selectedStoreId = typeof query.storeId === "string" ? query.storeId : "";
  const fallback = stores.find((store) => store.isMain) ?? stores[0];
  if (!fallback) throw new Error("Store belum tersedia");
  const selectedStore = stores.find((store) => store.id === selectedStoreId);
  if (selectedStore) return { store: mapStore(selectedStore), inRange: true };
  const location = locationFromQuery(query);
  if (!location) return { store: mapStore(fallback), inRange: true };
  const store = stores.map((item) => mapStore(item, location)).sort((a, b) => Number(a.distanceKm) - Number(b.distanceKm))[0];
  return { store, inRange: Number(store.distanceKm) <= store.radiusKm };
}

async function filteredProducts(req: Request, storeId: string) {
  const term = String(req.query.search ?? "");
  const category = req.query.category ? String(req.query.category) : undefined;
  const products = await prisma.product.findMany({ where: { name: { contains: term, mode: "insensitive" }, category: category ? { name: category } : undefined }, include: productInclude(storeId) });
  return products.map(mapProduct);
}

function productInclude(storeId: string) {
  const now = new Date();
  return {
    category: true,
    images: true,
    discounts: { where: { storeId, startsAt: { lte: now }, expiresAt: { gt: now } }, orderBy: { value: "desc" } },
    stocks: { where: { storeId }, select: { quantity: true } }
  } as const;
}

function mapProduct(product: ProductRow) {
  const discount = product.discounts[0];
  return {
    id: product.id,
    name: product.name,
    category: product.category.name,
    price: product.price,
    unit: product.unit,
    description: product.description ?? undefined,
    image: product.images[0]?.url ?? "/product.png",
    discount: discount ? discountLabel(discount) : null,
    organic: Boolean(discount),
    stock: product.stocks[0]?.quantity ?? 0
  };
}

function discountLabel(discount: ProductRow["discounts"][number]) {
  if (discount.type === "BOGO") return "BOGO";
  if (discount.type === "NOMINAL") return `Rp ${discount.value.toLocaleString("id-ID")}`;
  return `${discount.value}%`;
}

function sortProducts(items: ReturnType<typeof mapProduct>[], sort: string) {
  const copy = [...items];
  if (sort === "price_asc") return copy.sort((a, b) => a.price - b.price);
  if (sort === "price_desc") return copy.sort((a, b) => b.price - a.price);
  if (sort === "stock") return copy.sort((a, b) => b.stock - a.stock);
  return copy;
}

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  category: { name: string };
  images: { url: string }[];
  discounts: { type: "PERCENTAGE" | "NOMINAL" | "BOGO"; value: number }[];
  stocks: { quantity: number }[];
};
