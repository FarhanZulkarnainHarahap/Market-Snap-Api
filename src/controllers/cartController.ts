import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { handleControllerError } from "../utils/controllerHelpers.js";

type CartBody = {
  productId?: string;
  storeId?: string;
  quantity?: number;
};

export async function getCart(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.verified) {
      res.status(403).json({ message: "Verifikasi email untuk melanjutkan." });
      return;
    }
    const items = await prisma.cartItem.findMany({ where: { userId: req.user?.id }, include: cartInclude });
    const data = await Promise.all(items.map(enrichCartItem));
    res.json(cartDto(data));
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function addCartItem(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.verified) {
      res.status(403).json({ message: "Verifikasi akun terlebih dahulu sebelum menambahkan produk ke keranjang." });
      return;
    }
    const body = req.body as CartBody;
    const product = body.productId ? await prisma.product.findUnique({ where: { id: body.productId } }) : null;
    const store = body.storeId ? await prisma.store.findUnique({ where: { id: body.storeId } }) : await mainStore();
    if (!product || !store) return notFound(res, "Produk atau store tidak ditemukan");
    const inventory = await stockFor(store.id, product.id);
    const quantity = Number(body.quantity ?? 1);
    const existing = await findCart(String(req.user?.id), product.id, store.id);
    if (inventory < quantity + (existing?.quantity ?? 0)) return outOfStock(res);
    const item = await prisma.cartItem.upsert({ where: { userId_productId_storeId: { userId: String(req.user?.id), productId: product.id, storeId: store.id } }, update: { quantity: { increment: quantity } }, create: { userId: String(req.user?.id), productId: product.id, storeId: store.id, quantity }, include: cartInclude });
    res.status(existing ? 200 : 201).json({ data: await enrichCartItem(item) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateCartItem(req: Request, res: Response): Promise<void> {
  try {
    const item = await prisma.cartItem.findFirst({ where: { id: String(req.params.id), userId: req.user?.id } });
    if (!item) return notFound(res, "Cart item tidak ditemukan");
    const inventory = await stockFor(item.storeId, item.productId);
    const quantity = Number(req.body.quantity);
    if (inventory < quantity) return outOfStock(res);
    const updated = await prisma.cartItem.update({ where: { id: item.id }, data: { quantity }, include: cartInclude });
    res.json({ data: await enrichCartItem(updated) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function deleteCartItem(req: Request, res: Response): Promise<void> {
  try {
    const result = await prisma.cartItem.deleteMany({ where: { id: String(req.params.id), userId: req.user?.id } });
    if (!result.count) return notFound(res, "Cart item tidak ditemukan");
    res.json({ message: "Produk berhasil dihapus dari cart" });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function clearCart(req: Request, res: Response): Promise<void> {
  try {
    const result = await prisma.cartItem.deleteMany({ where: { userId: req.user?.id } });
    res.json({ message: "Cart berhasil dikosongkan", removed: result.count });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function deleteSelectedCartItems(req: Request, res: Response): Promise<void> {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) {
      res.status(422).json({ message: "Pilih produk yang ingin dihapus." });
      return;
    }
    const result = await prisma.cartItem.deleteMany({ where: { id: { in: ids }, userId: req.user?.id } });
    res.json({ message: "Produk terpilih berhasil dihapus dari cart", removed: result.count });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function validateCartVoucher(req: Request, res: Response): Promise<void> {
  try {
    const code = String(req.body.code ?? "").trim().toUpperCase();
    const selectedIds = Array.isArray(req.body.selectedCartItemIds) ? req.body.selectedCartItemIds.map(String).filter(Boolean) : [];
    const items = await prisma.cartItem.findMany({
      where: { userId: req.user?.id, ...(selectedIds.length ? { id: { in: selectedIds } } : {}) },
      include: cartInclude
    });
    if (!items.length) {
      res.status(422).json({ message: "Pilih produk sebelum memakai voucher." });
      return;
    }
    const voucher = await prisma.voucher.findUnique({ where: { code } });
    const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const validation = validateVoucher(voucher, subtotal, items.map((item) => item.productId));
    if (!validation.valid) {
      res.status(validation.status).json({ message: validation.message });
      return;
    }
    res.json({
      data: {
        voucher,
        discount: validation.discount,
        subtotal,
        totalAfterDiscount: Math.max(0, subtotal - validation.discount)
      },
      message: "Voucher berhasil digunakan."
    });
  } catch (error) {
    handleControllerError(res, error);
  }
}

async function mainStore() {
  return (await prisma.store.findFirst({ where: { isMain: true } })) ?? prisma.store.findFirst();
}

async function findCart(userId: string, productId: string, storeId: string) {
  return prisma.cartItem.findUnique({ where: { userId_productId_storeId: { userId, productId, storeId } } });
}

async function enrichCartItem(item: CartRow) {
  const stock = await stockFor(item.storeId, item.productId);
  return {
    id: item.id,
    userId: item.userId,
    productId: item.productId,
    storeId: item.storeId,
    store: mapCartStore(item.store),
    quantity: item.quantity,
    stock,
    inventory: { availableStock: stock, status: stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK" },
    unitPrice: item.product.price,
    subtotal: item.product.price * item.quantity,
    product: mapProduct(item.product)
  };
}

function mapProduct(product: CartRow["product"]) {
  const image = product.images[0]?.url ?? "/product.png";
  return {
    id: product.id,
    name: product.name,
    category: product.category.name,
    price: product.price,
    unit: product.unit,
    image,
    primaryImage: { url: image, alt: product.name },
    discount: null,
    organic: false
  };
}

function mapCartStore(store: CartRow["store"]) {
  return { id: store.id, name: store.name, address: store.city, city: store.city, isOpen: true };
}

function cartDto(items: Awaited<ReturnType<typeof enrichCartItem>>[]) {
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const estimatedShipping = items.length ? 10000 : 0;
  const discount = 0;
  const store = items[0]?.store ?? null;
  return {
    success: true,
    data: {
      id: items.length ? `cart-${items[0]?.userId}` : null,
      store,
      items,
      itemCount,
      subtotal,
      discount,
      estimatedShipping,
      total: Math.max(0, subtotal + estimatedShipping - discount)
    }
  };
}

function validateVoucher(voucher: Awaited<ReturnType<typeof prisma.voucher.findUnique>>, subtotal: number, productIds: string[]) {
  if (!voucher) return { valid: false, status: 404, message: "Voucher tidak ditemukan.", discount: 0 };
  if (voucher.expiresAt.getTime() < Date.now()) return { valid: false, status: 410, message: "Voucher sudah kedaluwarsa.", discount: 0 };
  if (voucher.minSpend && subtotal < voucher.minSpend) return { valid: false, status: 422, message: `Minimal belanja voucher ini belum terpenuhi.`, discount: 0 };
  if (voucher.scope === "PRODUCT" && voucher.productId && !productIds.includes(voucher.productId)) return { valid: false, status: 422, message: "Voucher tidak dapat digunakan untuk produk tersebut.", discount: 0 };
  const rawDiscount = voucher.type === "PERCENTAGE" ? Math.round(subtotal * (voucher.value / 100)) : voucher.value;
  const cappedDiscount = voucher.maxDiscount ? Math.min(rawDiscount, voucher.maxDiscount) : rawDiscount;
  return { valid: true, status: 200, message: "Voucher berhasil digunakan.", discount: Math.min(subtotal, Math.max(0, cappedDiscount)) };
}

async function stockFor(storeId: string, productId: string): Promise<number> {
  return prisma.inventory.findUnique({ where: { storeId_productId: { storeId, productId } } }).then((item) => item?.quantity ?? 0);
}

function notFound(res: Response, message: string): void {
  res.status(404).json({ message });
}

function outOfStock(res: Response): void {
  res.status(422).json({ message: "Stok tidak mencukupi untuk cart" });
}

const cartInclude = { product: { include: { category: true, images: true } }, store: true };

type CartRow = {
  id: string;
  userId: string;
  productId: string;
  storeId: string;
  quantity: number;
  product: { id: string; name: string; price: number; unit: string; category: { name: string }; images: { url: string }[] };
  store: { id: string; name: string; city: string };
};
