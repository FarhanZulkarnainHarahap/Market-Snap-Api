import type { Request, Response } from "express";
import { OrderStatus } from "../../prisma/generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { calculateDomesticShippingCost, rajaongkirConfig } from "../config/rajaongkir.js";
import { createXenditInvoice, xenditConfig } from "../config/xendit.js";
import { handleControllerError, locationFromQuery, mapStore, orderNumber } from "../utils/controllerHelpers.js";

type CreateOrderBody = {
  total?: number;
  items?: { productId?: string; quantity?: number; price?: number }[];
  location?: Record<string, unknown>;
  destinationId?: string;
  courier?: string;
  weightGram?: number;
  paymentMethod?: "manual_transfer" | "xendit";
};

export async function createOrder(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as CreateOrderBody;
    const store = await nearestStore(body.location ?? {});
    if (!store.inRange) {
      res.status(422).json({ message: "Alamat di luar jangkauan toko" });
      return;
    }
    const stockIssue = await stockIssueFor(store.data.id, body.items ?? []);
    if (stockIssue) {
      res.status(422).json({ message: stockIssue });
      return;
    }
    const shipping = await shippingQuote(body);
    const orderNo = orderNumber();
    const total = orderTotal(body, shipping.cost);
    const payment = await paymentInvoice(body, orderNo, total, req.user?.email ?? "");
    const order = await prisma.order.create({ data: { orderNumber: orderNo, userId: String(req.user?.id), storeId: store.data.id, total, shippingCost: shipping.cost, paymentDeadline: new Date(Date.now() + 60 * 60 * 1000) } });
    await createOrderItems(order.id, body.items ?? [], store.data.id);
    await prisma.cartItem.deleteMany({ where: { userId: req.user?.id, storeId: store.data.id } });
    res.status(201).json({ data: { ...order, status: "Menunggu Pembayaran" }, shipping, payment });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getOrders(req: Request, res: Response): Promise<void> {
  try {
    const orders = await prisma.order.findMany({ where: req.query.status ? { status: statusFromText(String(req.query.status)) } : undefined, include: { items: true, store: true }, orderBy: { createdAt: "desc" } });
    res.json({ data: orders });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
  try {
    const order = await prisma.order.update({ where: { id: String(req.params.id) }, data: { status: statusFromText(req.body.status) } });
    res.json({ data: order });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateOrder(req: Request, res: Response): Promise<void> {
  try {
    const order = await prisma.order.update({ where: { id: String(req.params.id) }, data: { total: req.body.total === undefined ? undefined : Number(req.body.total), status: req.body.status ? statusFromText(req.body.status) : undefined } });
    res.json({ data: order });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function deleteOrder(req: Request, res: Response): Promise<void> {
  try {
    await prisma.orderItem.deleteMany({ where: { orderId: String(req.params.id) } });
    const order = await prisma.order.delete({ where: { id: String(req.params.id) } });
    res.json({ message: "Order berhasil dihapus", data: order });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function uploadPayment(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ message: "Bukti bayar wajib diupload" });
      return;
    }
    const order = await prisma.order.update({ where: { id: String(req.params.id) }, data: { status: "WAITING_PAYMENT_CONFIRMATION" } });
    res.json({ message: "Bukti bayar tervalidasi dan siap dikirim ke Cloudinary", file: { name: req.file.originalname, size: req.file.size, type: req.file.mimetype }, data: order });
  } catch (error) {
    handleControllerError(res, error);
  }
}

async function nearestStore(input: Record<string, unknown>) {
  const stores = await prisma.store.findMany();
  const fallback = stores.find((store) => store.isMain) ?? stores[0];
  if (!fallback) throw new Error("Store belum tersedia");
  const location = locationFromQuery(input);
  if (!location) return { data: fallback, inRange: true };
  const store = stores.map((item) => mapStore(item, location)).sort((a, b) => Number(a.distanceKm) - Number(b.distanceKm))[0];
  return { data: fallback.id === store.id ? fallback : stores.find((item) => item.id === store.id) ?? fallback, inRange: Number(store.distanceKm) <= store.radiusKm };
}

async function stockIssueFor(storeId: string, items: CreateOrderBody["items"]) {
  for (const item of items ?? []) {
    if (!item.productId) continue;
    const quantity = Number(item.quantity ?? 1);
    const inventory = await prisma.inventory.findUnique({ where: { storeId_productId: { storeId, productId: item.productId } }, include: { product: true } });
    if (!inventory || inventory.quantity < quantity) return `Stok ${inventory?.product.name ?? item.productId} tidak mencukupi`;
  }
  return null;
}

async function createOrderItems(orderId: string, items: CreateOrderBody["items"], storeId: string) {
  await prisma.$transaction(async (tx) => {
    for (const item of items ?? []) {
      if (!item.productId) continue;
      const quantity = Number(item.quantity ?? 1);
      await tx.orderItem.create({ data: { orderId, productId: item.productId, quantity, price: Number(item.price ?? 0) } });
      await tx.inventory.update({ where: { storeId_productId: { storeId, productId: item.productId } }, data: { quantity: { decrement: quantity } } });
      await tx.stockJournal.create({ data: { storeId, productId: item.productId, change: -quantity, note: `Order ${orderId}` } });
    }
  });
}

async function shippingQuote(body: CreateOrderBody) {
  if (!body.destinationId) return { cost: 0, provider: "manual", detail: null };
  if (!rajaongkirConfig.hasApiKey || !rajaongkirConfig.originId) throw new Error("Konfigurasi RajaOngkir belum lengkap");
  const quote = await calculateDomesticShippingCost({ destinationId: body.destinationId, courier: body.courier, weightGram: body.weightGram });
  return { cost: quote.cost, provider: "rajaongkir", detail: quote.raw };
}

async function paymentInvoice(body: CreateOrderBody, orderNo: string, amount: number, email: string) {
  const method = body.paymentMethod ?? (xenditConfig.hasSecretKey ? "xendit" : "manual_transfer");
  if (method === "manual_transfer") return { method, invoiceUrl: null, externalId: null };
  if (!xenditConfig.hasSecretKey) throw new Error("Konfigurasi Xendit belum lengkap");
  const invoice = await createXenditInvoice({ orderNumber: orderNo, amount, payerEmail: email, description: `Pembayaran Market Snap ${orderNo}` });
  return { method, invoiceUrl: invoice.invoice_url, externalId: invoice.external_id, status: invoice.status };
}

function orderTotal(body: CreateOrderBody, shippingCost: number): number {
  const subtotal = (body.items ?? []).reduce((sum, item) => sum + Number(item.price ?? 0) * Number(item.quantity ?? 1), 0);
  if (body.destinationId) return (subtotal || Number(body.total ?? 0)) + shippingCost;
  return Number(body.total ?? subtotal);
}

function statusFromText(value: string): OrderStatus {
  const statuses: Record<string, OrderStatus> = { "Menunggu Pembayaran": "WAITING_PAYMENT", "Menunggu Konfirmasi Pembayaran": "WAITING_PAYMENT_CONFIRMATION", Diproses: "PROCESSING", Dikirim: "SHIPPED", "Pesanan Dikonfirmasi": "CONFIRMED", Dibatalkan: "CANCELLED" };
  return statuses[value] ?? (value as OrderStatus);
}
