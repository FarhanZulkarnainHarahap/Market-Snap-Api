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
    const filtered = filterMappedProducts(products, req.query);
    const sorted = sortProducts(filtered, String(req.query.sort ?? req.query.sortBy ?? "featured"));
    res.json({ ...paginate(sorted, req.query.page, req.query.limit), store, serviceable: inRange });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getProductDetail(req: Request, res: Response): Promise<void> {
  try {
    const { store } = await resolveStore(req.query);
    const product = await findProductByIdOrSlug(String(req.params.id), store.id);
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
  const images = product.images
    .map((image, index) => ({ altText: `${product.name} ${index + 1}`, id: image.id, position: index, url: image.url }))
    .sort((a, b) => a.position - b.position);
  const primaryImage = images[0] ?? { altText: product.name, id: "fallback", position: 0, url: "/product.png" };
  return {
    id: product.id,
    slug: slugify(product.name),
    name: product.name,
    category: product.category.name,
    price: product.price,
    unit: product.unit,
    description: product.description ?? undefined,
    image: primaryImage.url,
    images,
    primaryImage,
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
  if (sort === "discount_desc") return copy.sort((a, b) => Number(Boolean(b.discount)) - Number(Boolean(a.discount)));
  if (sort === "stock") return copy.sort((a, b) => b.stock - a.stock);
  return copy.sort((a, b) => a.name.localeCompare(b.name, "id"));
}

function filterMappedProducts(items: ReturnType<typeof mapProduct>[], query: Request["query"]) {
  const minPrice = Number(query.minPrice);
  const maxPrice = Number(query.maxPrice);
  const promo = String(query.promo ?? "").toLowerCase() === "true";
  const inStock = String(query.inStock ?? "").toLowerCase() === "true";
  return items.filter((item) => {
    if (Number.isFinite(minPrice) && item.price < minPrice) return false;
    if (Number.isFinite(maxPrice) && item.price > maxPrice) return false;
    if (promo && !item.discount) return false;
    if (inStock && item.stock < 1) return false;
    return true;
  });
}

async function findProductByIdOrSlug(value: string, storeId: string) {
  const byId = await prisma.product.findUnique({ where: { id: value }, include: productInclude(storeId) });
  if (byId) return byId;
  const products = await prisma.product.findMany({ include: productInclude(storeId) });
  return products.find((product) => slugify(product.name) === value) ?? null;
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  category: { name: string };
  images: { id: string; url: string }[];
  discounts: { type: "PERCENTAGE" | "NOMINAL" | "BOGO"; value: number }[];
  stocks: { quantity: number }[];
};
