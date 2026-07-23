import type { Request, Response } from "express";
import type { OrderStatus, Prisma } from "../../prisma/generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { calculateDomesticShippingCost, rajaongkirConfig } from "../config/rajaongkir.js";
import { createXenditInvoice, xenditConfig } from "../config/xendit.js";
import { distanceKm } from "../utils/distance.js";
import { handleControllerError, locationFromQuery, mapStore, orderNumber } from "../utils/controllerHelpers.js";

type CreateOrderBody = {
  selectedCartItemIds?: string[];
  items?: { productId?: string; quantity?: number }[];
  location?: Record<string, unknown>;
  destinationId?: string;
  courier?: string;
  shippingMethod?: string;
  deliveryDate?: string;
  deliverySlot?: string;
  voucherCode?: string;
  weightGram?: number;
  paymentMethod?: "manual_transfer" | "xendit";
  paymentChannel?: string;
  orderNote?: string;
  addressId?: string;
  storeId?: string;
};

type CheckoutItem = {
  cartId?: string;
  productId: string;
  quantity: number;
  storeId: string;
  price: number;
  name: string;
  category: string;
};

type VoucherValidation = {
  discount: number;
  message: string;
  valid: boolean;
  voucher?: { id: string; code: string };
};

const statusLabels: Record<OrderStatus, string> = {
  CANCELLED: "Dibatalkan",
  CONFIRMED: "Pesanan Dikonfirmasi",
  PROCESSING: "Diproses",
  SHIPPED: "Dikirim",
  WAITING_PAYMENT: "Menunggu Pembayaran",
  WAITING_PAYMENT_CONFIRMATION: "Menunggu Konfirmasi Pembayaran"
};

export async function getCheckoutOptions(_req: Request, res: Response): Promise<void> {
  res.json({
    data: {
      paymentMethods: paymentMethodOptions(),
      shippingMethods: shippingMethodOptions()
    }
  });
}

export async function createOrder(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as CreateOrderBody;
    const userId = String(req.user?.id);
    const userEmail = String(req.user?.email ?? "");
    const items = await checkoutItems(userId, body);
    if (!items.length) {
      res.status(422).json({ message: "Pilih produk sebelum membuat pesanan." });
      return;
    }

    const store = await resolveStore(body, items);
    if (!store) {
      res.status(404).json({ message: "Cabang tidak ditemukan." });
      return;
    }
    const shippingMethods = shippingMethodOptions();
    const requestedShippingMethod = body.shippingMethod || body.courier || shippingMethods[0].id;
    const shippingMethod = shippingMethods.find((method) => method.id === requestedShippingMethod);
    if (!shippingMethod) {
      res.status(422).json({ message: "Metode pengiriman tidak tersedia." });
      return;
    }
    const address = body.addressId ? await prisma.address.findFirst({ where: { id: body.addressId, userId } }) : null;
    if (shippingMethod.requiresAddress && !address && !locationFromQuery(body.location ?? {})) {
      res.status(422).json({ message: "Alamat pengiriman wajib dipilih." });
      return;
    }
    if (!shippingMethod.requiresAddress && !store.id) {
      res.status(422).json({ message: "Cabang wajib dipilih untuk ambil di cabang." });
      return;
    }
    if (shippingMethod.requiresAddress && address && distanceKm({ lat: address.latitude, lng: address.longitude }, { lat: store.latitude, lng: store.longitude }) > store.radiusKm) {
      res.status(422).json({ message: "Alamat di luar jangkauan toko." });
      return;
    }

    const stockIssue = await stockIssueFor(store.id, items);
    if (stockIssue) {
      res.status(422).json({ message: stockIssue });
      return;
    }

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const voucher = await validateVoucher(body.voucherCode, subtotal, items.map((item) => item.productId));
    if (body.voucherCode && !voucher.valid) {
      res.status(422).json({ message: voucher.message });
      return;
    }
    const deliveryDate = safeDate(body.deliveryDate);
    if (!deliveryDate || !body.deliverySlot) {
      res.status(422).json({ message: "Jadwal dan slot pengiriman wajib dipilih." });
      return;
    }
    if (isPastSchedule(deliveryDate, body.deliverySlot)) {
      res.status(422).json({ message: "Jadwal pengiriman tidak boleh berada di masa lalu." });
      return;
    }

    const shipping = await shippingQuote(body, shippingMethod);
    const serviceFee = Number(process.env.ORDER_SERVICE_FEE ?? 0);
    const total = Math.max(0, subtotal + shipping.cost + serviceFee - voucher.discount);
    if (!paymentMethodOptions().some((method) => method.id === body.paymentChannel)) {
      res.status(422).json({ message: "Metode pembayaran tidak tersedia." });
      return;
    }
    const payment = await paymentInvoice(body, orderNumber(), total, userEmail);
    const orderNo = payment.orderNumber;
    const paymentDeadline = new Date(Date.now() + 60 * 60 * 1000);

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          addressId: address?.id,
          addressSnapshot: address ? addressSnapshot(address) : undefined,
          courierName: shipping.provider,
          deliveryDate,
          deliverySlot: body.deliverySlot,
          discountTotal: voucher.discount,
          estimatedArrival: estimatedArrival(deliveryDate, shippingMethod.id),
          orderNote: cleanText(body.orderNote),
          orderNumber: orderNo,
          paymentChannel: payment.channel,
          paymentDeadline,
          paymentExternalId: payment.externalId,
          paymentInvoiceUrl: payment.invoiceUrl,
          paymentMethod: payment.method,
          serviceFee,
          shippingCost: shipping.cost,
          shippingMethod: shippingMethod.id,
          shippingProvider: shipping.provider,
          status: "WAITING_PAYMENT",
          storeId: store.id,
          total,
          userId,
          voucherCode: voucher.voucher?.code,
          voucherId: voucher.voucher?.id
        }
      });

      for (const item of items) {
        await tx.orderItem.create({ data: { orderId: created.id, productId: item.productId, quantity: item.quantity, price: item.price } });
        await tx.inventory.update({ where: { storeId_productId: { storeId: store.id, productId: item.productId } }, data: { quantity: { decrement: item.quantity } } });
        await tx.stockJournal.create({ data: { storeId: store.id, productId: item.productId, change: -item.quantity, note: `Order ${created.orderNumber}` } });
      }

      if (voucher.voucher && voucher.discount > 0) {
        await tx.voucherUsage.create({ data: { code: voucher.voucher.code, discount: voucher.discount, orderId: created.id, userId, voucherId: voucher.voucher.id } });
      }

      await tx.orderStatusHistory.create({ data: { orderId: created.id, status: "WAITING_PAYMENT", description: "Pesanan dibuat dan menunggu pembayaran." } });

      const cartIds = items.map((item) => item.cartId).filter((id): id is string => Boolean(id));
      if (cartIds.length) await tx.cartItem.deleteMany({ where: { id: { in: cartIds }, userId } });
      else await tx.cartItem.deleteMany({ where: { userId, storeId: store.id, productId: { in: items.map((item) => item.productId) } } });

      return created;
    });

    res.status(201).json({ data: { ...order, status: statusLabels[order.status] }, shipping, payment: { ...payment, orderNumber: undefined } });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getOrders(req: Request, res: Response): Promise<void> {
  try {
    const where = orderWhere(req, req.query.status ? { status: statusFromText(String(req.query.status)) } : {});
    const orders = await prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: "desc" }
    });
    res.json({ data: orders });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getOrderById(req: Request, res: Response): Promise<void> {
  try {
    const order = await prisma.order.findFirst({ where: orderWhere(req, { id: String(req.params.id) }), include: orderInclude });
    if (!order) {
      res.status(404).json({ message: "Order tidak ditemukan." });
      return;
    }
    res.json({ data: order });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getOrderTracking(req: Request, res: Response): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: orderWhere(req, { id: String(req.params.id) }),
      include: { ...orderInclude, histories: { orderBy: { createdAt: "asc" } } }
    });
    if (!order) {
      res.status(404).json({ message: "Tracking order tidak ditemukan." });
      return;
    }
    res.json({ data: order });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getOrderStatistics(req: Request, res: Response): Promise<void> {
  try {
    const userId = String(req.user?.id);
    const from = periodStart(String(req.query.period ?? "6months"));
    const orders = await prisma.order.findMany({
      where: { userId, createdAt: { gte: from } },
      include: { items: { include: { product: { include: { category: true } } } } },
      orderBy: { createdAt: "asc" }
    });
    const completed = orders.filter((order) => order.status === "CONFIRMED");
    const cancelled = orders.filter((order) => order.status === "CANCELLED");
    const totalSpent = completed.reduce((sum, order) => sum + order.total, 0);
    const totalSavings = orders.reduce((sum, order) => sum + order.discountTotal, 0);
    res.json({
      data: {
        averageOrderValue: completed.length ? Math.round(totalSpent / completed.length) : 0,
        cancelledOrders: cancelled.length,
        completedOrders: completed.length,
        monthlyOrders: bucketOrders(orders, "count"),
        monthlySpending: bucketOrders(completed, "total"),
        ordersByStatus: countBy(orders.map((order) => statusLabels[order.status])),
        productsByCategory: countBy(orders.flatMap((order) => order.items.map((item) => item.product.category.name))),
        totalOrders: orders.length,
        totalSavings,
        totalSpent
      }
    });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
  try {
    const status = statusFromText(req.body.status);
    const where = orderWhere(req, { id: String(req.params.id) });
    const order = await prisma.$transaction(async (tx) => {
      const exists = await tx.order.findFirst({ where });
      if (!exists) return null;
      const updated = await tx.order.update({ where: { id: exists.id }, data: { status } });
      await tx.orderStatusHistory.create({ data: { orderId: updated.id, status, description: historyDescription(status), location: cleanText(req.body.location) } });
      return updated;
    });
    if (!order) {
      res.status(404).json({ message: "Order tidak ditemukan." });
      return;
    }
    res.json({ data: order });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateOrder(req: Request, res: Response): Promise<void> {
  try {
    const order = await prisma.order.update({ where: { id: String(req.params.id) }, data: { status: req.body.status ? statusFromText(req.body.status) : undefined } });
    res.json({ data: order });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function deleteOrder(req: Request, res: Response): Promise<void> {
  try {
    const exists = await prisma.order.findFirst({ where: orderWhere(req, { id: String(req.params.id) }) });
    if (!exists) {
      res.status(404).json({ message: "Order tidak ditemukan." });
      return;
    }
    await prisma.orderItem.deleteMany({ where: { orderId: exists.id } });
    const order = await prisma.order.delete({ where: { id: exists.id } });
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
    const exists = await prisma.order.findFirst({ where: orderWhere(req, { id: String(req.params.id) }) });
    if (!exists) {
      res.status(404).json({ message: "Order tidak ditemukan." });
      return;
    }
    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({ where: { id: exists.id }, data: { status: "WAITING_PAYMENT_CONFIRMATION" } });
      await tx.orderStatusHistory.create({ data: { orderId: updated.id, status: "WAITING_PAYMENT_CONFIRMATION", description: "Bukti pembayaran diunggah dan menunggu konfirmasi." } });
      return updated;
    });
    res.json({ message: "Bukti bayar tervalidasi dan siap dikirim ke Cloudinary", file: { name: req.file.originalname, size: req.file.size, type: req.file.mimetype }, data: order });
  } catch (error) {
    handleControllerError(res, error);
  }
}

async function checkoutItems(userId: string, body: CreateOrderBody): Promise<CheckoutItem[]> {
  const selectedIds = body.selectedCartItemIds?.filter(Boolean) ?? [];
  if (selectedIds.length) {
    const cartItems = await prisma.cartItem.findMany({
      where: { id: { in: selectedIds }, userId },
      include: { product: { include: { category: true } } }
    });
    return cartItems.map((item) => ({
      cartId: item.id,
      category: item.product.category.name,
      name: item.product.name,
      price: item.product.price,
      productId: item.productId,
      quantity: item.quantity,
      storeId: item.storeId
    }));
  }
  if (body.items?.length) {
    const productIds = body.items.map((item) => String(item.productId ?? "")).filter(Boolean);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, include: { category: true } });
    const fallbackStore = body.storeId ?? (await prisma.store.findFirst({ where: { isMain: true } }))?.id ?? (await prisma.store.findFirst())?.id ?? "";
    return body.items.flatMap((item) => {
      const product = products.find((entry) => entry.id === item.productId);
      if (!product || !fallbackStore) return [];
      return [{ category: product.category.name, name: product.name, price: product.price, productId: product.id, quantity: Math.max(1, Number(item.quantity ?? 1)), storeId: fallbackStore }];
    });
  }
  return [];
}

async function resolveStore(body: CreateOrderBody, items: CheckoutItem[]) {
  if (body.storeId) return prisma.store.findUnique({ where: { id: body.storeId } });
  const itemStoreIds = Array.from(new Set(items.map((item) => item.storeId)));
  if (itemStoreIds.length === 1) return prisma.store.findUnique({ where: { id: itemStoreIds[0] } });
  const nearest = await nearestStore(body.location ?? {});
  return nearest.data;
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

async function stockIssueFor(storeId: string, items: CheckoutItem[]) {
  for (const item of items) {
    const inventory = await prisma.inventory.findUnique({ where: { storeId_productId: { storeId, productId: item.productId } }, include: { product: true } });
    if (!inventory || inventory.quantity < item.quantity) return `Stok ${inventory?.product.name ?? item.name} tidak mencukupi`;
  }
  return null;
}

async function validateVoucher(code: string | undefined, subtotal: number, productIds: string[]): Promise<VoucherValidation> {
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return { discount: 0, message: "", valid: true };
  const voucher = await prisma.voucher.findUnique({ where: { code: normalized } });
  if (!voucher) return { discount: 0, message: "Voucher tidak ditemukan.", valid: false };
  if (voucher.expiresAt.getTime() < Date.now()) return { discount: 0, message: "Voucher sudah kedaluwarsa.", valid: false };
  if (voucher.minSpend && subtotal < voucher.minSpend) return { discount: 0, message: "Voucher belum memenuhi minimum pembelian.", valid: false };
  if (voucher.scope === "PRODUCT" && voucher.productId && !productIds.includes(voucher.productId)) return { discount: 0, message: "Voucher tidak dapat digunakan untuk produk tersebut.", valid: false };
  const raw = voucher.type === "PERCENTAGE" ? Math.round(subtotal * (voucher.value / 100)) : voucher.value;
  const discount = Math.min(subtotal, voucher.maxDiscount ? Math.min(raw, voucher.maxDiscount) : raw);
  return { discount: Math.max(0, discount), message: "Voucher berhasil digunakan.", valid: true, voucher: { id: voucher.id, code: voucher.code } };
}

async function shippingQuote(body: CreateOrderBody, method: ReturnType<typeof shippingMethodOptions>[number]) {
  if (method.id === "pickup") return { cost: 0, provider: "pickup", detail: null };
  if (body.destinationId && rajaongkirConfig.hasApiKey && rajaongkirConfig.originId) {
    const quote = await calculateDomesticShippingCost({ destinationId: body.destinationId, courier: body.courier, weightGram: body.weightGram });
    return { cost: quote.cost, provider: "rajaongkir", detail: quote.raw };
  }
  return { cost: method.cost, provider: "market-snap", detail: null };
}

async function paymentInvoice(body: CreateOrderBody, orderNo: string, amount: number, email: string) {
  const methods = paymentMethodOptions();
  const selected = methods.find((method) => method.id === body.paymentChannel);
  if (!selected) throw new Error("Metode pembayaran tidak tersedia.");
  const method = selected.provider === "xendit" ? "xendit" : "manual_transfer";
  if (method === "manual_transfer") return { channel: selected.channel, externalId: null, invoiceUrl: null, method, orderNumber: orderNo, status: "MANUAL" };
  if (!xenditConfig.hasSecretKey) throw new Error("Konfigurasi Xendit belum lengkap");
  const invoice = await createXenditInvoice({ orderNumber: orderNo, amount, payerEmail: email, description: `Pembayaran Market Snap ${orderNo}`, paymentChannels: [selected.channel] });
  return { channel: selected.channel, externalId: invoice.external_id, invoiceUrl: invoice.invoice_url, method, orderNumber: orderNo, status: invoice.status };
}

function shippingMethodOptions() {
  return [
    { id: "standard", label: "Pengiriman Standar", description: "Estimasi reguler dari cabang terdekat.", eta: "2-4 jam", cost: Number(process.env.SHIPPING_STANDARD_COST ?? 10000), requiresAddress: true },
    { id: "express", label: "Pengiriman Express", description: "Prioritas lebih cepat bila cabang tersedia.", eta: "60-120 menit", cost: Number(process.env.SHIPPING_EXPRESS_COST ?? 18000), requiresAddress: true },
    { id: "pickup", label: "Ambil di Cabang", description: "Ambil pesanan langsung di cabang pilihan.", eta: "Sesuai jadwal ambil", cost: 0, requiresAddress: false }
  ];
}

function paymentMethodOptions() {
  if (!xenditConfig.hasSecretKey) return [{ id: "manual_transfer", label: "Transfer Manual", provider: "manual", channel: "MANUAL_TRANSFER", description: "Konfirmasi pembayaran manual dari admin." }];
  return [
    { id: "va-bca", label: "BCA Virtual Account", provider: "xendit", channel: "BCA", description: "Bayar dari m-BCA, ATM, atau internet banking." },
    { id: "va-mandiri", label: "Mandiri Virtual Account", provider: "xendit", channel: "MANDIRI", description: "Livin, ATM, dan transfer bank." },
    { id: "va-bni", label: "BNI Virtual Account", provider: "xendit", channel: "BNI", description: "BNI Mobile, ATM, dan internet banking." },
    { id: "va-bri", label: "BRI Virtual Account", provider: "xendit", channel: "BRI", description: "BRImo, ATM, dan transfer bank." },
    { id: "qris", label: "QRIS", provider: "xendit", channel: "QRIS", description: "Scan QR dari aplikasi pembayaran favorit." },
    { id: "ewallet-ovo", label: "OVO", provider: "xendit", channel: "OVO", description: "Bayar memakai saldo OVO." },
    { id: "card", label: "Kartu Kredit / Debit", provider: "xendit", channel: "CREDIT_CARD", description: "Visa, Mastercard, dan kartu debit online." },
    { id: "retail", label: "Gerai Retail", provider: "xendit", channel: "ALFAMART", description: "Bayar melalui gerai retail yang tersedia." }
  ];
}

function addressSnapshot(address: NonNullable<Awaited<ReturnType<typeof prisma.address.findFirst>>>) {
  return {
    city: address.city,
    detail: address.detail,
    district: address.district,
    label: address.label,
    latitude: address.latitude,
    longitude: address.longitude,
    note: address.note,
    phone: address.phone,
    postalCode: address.postalCode,
    province: address.province,
    recipientName: address.recipientName
  };
}

function orderWhere(req: Request, extra: Prisma.OrderWhereInput): Prisma.OrderWhereInput {
  if (req.user?.role === "customer") return { ...extra, userId: req.user.id };
  if (req.user?.role === "store_admin" && req.user.storeId) return { ...extra, storeId: req.user.storeId };
  return extra;
}

const orderInclude = {
  histories: { orderBy: { createdAt: "asc" } },
  items: { include: { product: { include: { category: true, images: true } } } },
  store: true
} satisfies Prisma.OrderInclude;

function statusFromText(value: string): OrderStatus {
  const statuses: Record<string, OrderStatus> = { "Menunggu Pembayaran": "WAITING_PAYMENT", "Menunggu Konfirmasi Pembayaran": "WAITING_PAYMENT_CONFIRMATION", Diproses: "PROCESSING", Dikirim: "SHIPPED", "Pesanan Dikonfirmasi": "CONFIRMED", Dibatalkan: "CANCELLED" };
  return statuses[value] ?? (value as OrderStatus);
}

function historyDescription(status: OrderStatus) {
  const descriptions: Record<OrderStatus, string> = {
    CANCELLED: "Pesanan dibatalkan.",
    CONFIRMED: "Pesanan telah diterima pelanggan.",
    PROCESSING: "Pesanan sedang diproses cabang.",
    SHIPPED: "Pesanan sudah diserahkan ke kurir.",
    WAITING_PAYMENT: "Pesanan menunggu pembayaran.",
    WAITING_PAYMENT_CONFIRMATION: "Pembayaran menunggu konfirmasi."
  };
  return descriptions[status];
}

function periodStart(period: string) {
  const date = new Date();
  if (period === "7days") date.setDate(date.getDate() - 7);
  else if (period === "30days") date.setDate(date.getDate() - 30);
  else if (period === "3months") date.setMonth(date.getMonth() - 3);
  else if (period === "12months") date.setMonth(date.getMonth() - 12);
  else if (period === "year") return new Date(date.getFullYear(), 0, 1);
  else date.setMonth(date.getMonth() - 6);
  return date;
}

function bucketOrders(orders: { createdAt: Date; total: number }[], mode: "count" | "total") {
  const buckets = new Map<string, number>();
  for (const order of orders) {
    const key = order.createdAt.toLocaleDateString("id-ID", { month: "short", year: "numeric" });
    buckets.set(key, (buckets.get(key) ?? 0) + (mode === "count" ? 1 : order.total));
  }
  return Array.from(buckets, ([label, value]) => ({ label, value }));
}

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts, ([label, value]) => ({ label, value }));
}

function estimatedArrival(deliveryDate: Date | null, method: string) {
  if (!deliveryDate) return null;
  const eta = new Date(deliveryDate);
  eta.setHours(eta.getHours() + (method === "express" ? 2 : method === "pickup" ? 1 : 4));
  return eta;
}

function safeDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPastSchedule(date: Date, slot: string) {
  const end = slot.split("-").at(-1)?.trim() ?? "";
  const [hours = "0", minutes = "0"] = end.split(":");
  const scheduledEnd = new Date(date);
  scheduledEnd.setHours(Number(hours), Number(minutes), 0, 0);
  return scheduledEnd.getTime() < Date.now();
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}
