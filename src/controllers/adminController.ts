import type { Request, Response } from "express";
import { DiscountType, VoucherScope } from "../../prisma/generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { handleControllerError, mapStore } from "../utils/controllerHelpers.js";

export async function getStores(_req: Request, res: Response): Promise<void> {
  try {
    const stores = await prisma.store.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ data: stores.map((store) => mapStore(store)) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function createStore(req: Request, res: Response): Promise<void> {
  try {
    const store = await prisma.store.create({ data: { id: slug(req.body.name), name: req.body.name, city: req.body.city, latitude: Number(req.body.lat), longitude: Number(req.body.lng), radiusKm: Number(req.body.radiusKm), isMain: Boolean(req.body.isMain) } });
    if (req.body.adminId) await prisma.user.updateMany({ where: { id: req.body.adminId }, data: { storeId: store.id } });
    res.status(201).json({ data: mapStore(store) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getDiscounts(_req: Request, res: Response): Promise<void> {
  try {
    const vouchers = await prisma.voucher.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ data: vouchers });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function createDiscount(req: Request, res: Response): Promise<void> {
  try {
    const voucher = await prisma.voucher.create({ data: { code: req.body.code ?? `SNAP-${Date.now()}`, title: req.body.title, scope: voucherScope(req.body.type), type: discountType(req.body.discountType), value: Number(req.body.value), maxDiscount: Number(req.body.maxDiscount ?? 0), minSpend: Number(req.body.minSpend ?? 0), expiresAt: new Date(req.body.expiresAt) } });
    res.status(201).json({ data: voucher });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getSalesReport(_req: Request, res: Response): Promise<void> {
  try {
    const [total, orders] = await Promise.all([prisma.order.aggregate({ _sum: { total: true } }), prisma.order.count()]);
    res.json({ data: { month: "Mei 2026", totalSales: total._sum.total ?? 0, orders, byCategory: [] } });
  } catch (error) {
    handleControllerError(res, error);
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function voucherScope(value: unknown): VoucherScope {
  if (value === "shipping") return VoucherScope.SHIPPING;
  if (value === "product") return VoucherScope.PRODUCT;
  return VoucherScope.CART;
}

function discountType(value: unknown): DiscountType {
  return value === "nominal" ? DiscountType.NOMINAL : DiscountType.PERCENTAGE;
}
