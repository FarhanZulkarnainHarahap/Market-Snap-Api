import type { Request, Response } from "express";
import type { OrderStatus, Prisma } from "../../prisma/generated/prisma/client.js";
import { logBusinessEvent } from "../config/logger.js";
import { prisma } from "../config/prisma.js";
import { calculateDomesticShippingCost, rajaongkirConfig } from "../config/rajaongkir.js";
import { createXenditInvoice, xenditConfig, type XenditInvoiceItem } from "../services/xendit.service.js";
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
  paymentMethod?: "xendit";
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
  discount: number;
  finalPrice: number;
  imageUrl?: string | null;
  name: string;
  sku?: string | null;
  subtotal: number;
  category: string;
};

type CheckoutPayment = {
  channel: string;
  externalId: string | null;
  invoiceUrl: string | null;
  method: "xendit";
  orderNumber: string;
  redirectUrl: string | null;
  status: string;
  token?: string | null;
};

type CheckoutOrderResult = {
  id: string;
  orderNumber: string;
  paymentStatus?: string | null;
  status: string;
};

type CheckoutAddress = {
  city?: string | null;
  detail: string;
  district?: string | null;
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  note?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  province?: string | null;
  recipientName?: string | null;
};

type VoucherValidation = {
  discount: number;
  message: string;
  valid: boolean;
  voucher?: { id: string; code: string };
};

const statusLabels: Record<OrderStatus, string> = {
  CANCELLED: "Dibatalkan",
  COMPLETED: "Selesai",
  DELIVERED: "Terkirim",
  CONFIRMED: "Pesanan Dikonfirmasi",
  OUT_FOR_DELIVERY: "Dalam Pengiriman",
  PACKED: "Dikemas",
  PAID: "Pembayaran Berhasil",
  PENDING_PAYMENT: "Menunggu Pembayaran",
  PICKING: "Picking Produk",
  PROCESSING: "Diproses",
  READY: "Siap Dikirim",
  REFUNDED: "Refunded",
  SHIPPED: "Dikirim",
  WAITING_PAYMENT: "Menunggu Pembayaran",
  WAITING_PAYMENT_CONFIRMATION: "Menunggu Konfirmasi Pembayaran"
};

const deliverySlots = ["08:00 - 10:00", "10:00 - 12:00", "14:00 - 16:00", "18:00 - 20:00"];

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
    const address = await findCheckoutAddress(body.addressId, userId);
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

    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
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
    const orderNo = orderNumber();
    const paymentDeadline = new Date(Date.now() + 60 * 60 * 1000);
    const payment = initialPayment(body, orderNo);

    const order = await createCheckoutOrder({
      address,
      body,
      deliveryDate,
      items,
      orderNo,
      payment,
      paymentDeadline,
      serviceFee,
      shipping,
      shippingMethod,
      store,
      total,
      userId,
      voucher
    }).catch((error) => {
      if (!isCheckoutSchemaMissing(error)) throw error;
      return createLegacyCheckoutOrder({ items, orderNo, paymentDeadline, shippingCost: shipping.cost, storeId: store.id, total, userId });
    });

    let session: CheckoutPayment;
    try {
      session = await createPaymentSession({ amount: total, email: userEmail, items, orderNumber: order.orderNumber, payment, totals: { shippingCost: shipping.cost, serviceFee, discount: voucher.discount } });
    } catch (error) {
      await markPaymentSessionFailed(order.id);
      throw error;
    }

    const updated = await attachPaymentSessionToOrder(order.id, session);
    logBusinessEvent("PAYMENT_CREATED", { orderId: updated.id, orderNumber: updated.orderNumber, provider: session.method });

    res.status(201).json({
      data: {
        id: updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
        paymentStatus: updated.paymentStatus ?? session.status
      },
      shipping,
      payment: {
        method: session.method,
        redirectUrl: session.redirectUrl,
        invoiceUrl: session.redirectUrl,
        expiresAt: paymentDeadline.toISOString()
      }
    });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getOrderInvoice(req: Request, res: Response): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { orderNumber: String(req.params.orderNumber ?? "") },
      include: {
        items: { include: { product: { include: { images: true } } } },
        store: true,
        user: true
      }
    });
    if (!order || !canAccessOrder(req, order)) {
      res.status(404).json({ message: "Invoice tidak ditemukan." });
      return;
    }
    res.json({ data: invoicePayload(order) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getOrders(req: Request, res: Response): Promise<void> {
  try {
    const where = orderWhere(req, req.query.status ? { status: statusFromText(String(req.query.status)) } : {});
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const search = String(req.query.search ?? "").trim();
    const scopedWhere: Prisma.OrderWhereInput = search
      ? { ...where, OR: [{ orderNumber: { contains: search, mode: "insensitive" } }, { voucherCode: { contains: search, mode: "insensitive" } }] }
      : where;
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: scopedWhere,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.order.count({ where: scopedWhere })
    ]);
    res.json({ data: orders, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
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
    const completed = orders.filter((order) => order.status === "COMPLETED" || order.status === "DELIVERED" || order.status === "CONFIRMED");
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
      include: { product: { select: checkoutProductSelect() } }
    });
    return cartItems.map((item) => ({
      cartId: item.id,
      category: item.product.category.name,
      discount: activeProductDiscount(item.product.price, item.product.discounts, item.storeId),
      finalPrice: Math.max(0, item.product.price - activeProductDiscount(item.product.price, item.product.discounts, item.storeId)),
      imageUrl: item.product.images[0]?.url,
      name: item.product.name,
      price: item.product.price,
      productId: item.productId,
      quantity: item.quantity,
      sku: null,
      storeId: item.storeId
    })).map((item) => ({ ...item, subtotal: item.finalPrice * item.quantity }));
  }
  if (body.items?.length) {
    const productIds = body.items.map((item) => String(item.productId ?? "")).filter(Boolean);
    const fallbackStore = body.storeId ?? (await prisma.store.findFirst({ where: { isMain: true } }))?.id ?? (await prisma.store.findFirst())?.id ?? "";
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, isActive: true }, select: checkoutProductSelect() }).catch((error) => {
      if (!isCheckoutSchemaMissing(error)) throw error;
      return prisma.product.findMany({ where: { id: { in: productIds } }, select: checkoutProductSelect() });
    });
    return body.items.flatMap((item) => {
      const product = products.find((entry) => entry.id === item.productId);
      if (!product || !fallbackStore) return [];
      const discount = activeProductDiscount(product.price, product.discounts, fallbackStore);
      const quantity = Math.max(1, Number(item.quantity ?? 1));
      const finalPrice = Math.max(0, product.price - discount);
      return [{
        category: product.category.name,
        discount,
        finalPrice,
        imageUrl: product.images[0]?.url,
        name: product.name,
        price: product.price,
        productId: product.id,
        quantity,
        sku: null,
        storeId: fallbackStore,
        subtotal: finalPrice * quantity
      }];
    });
  }
  return [];
}

async function resolveStore(body: CreateOrderBody, items: CheckoutItem[]) {
  const itemStoreIds = Array.from(new Set(items.map((item) => item.storeId)));
  if (itemStoreIds.length === 1) return prisma.store.findUnique({ where: { id: itemStoreIds[0] } });
  if (body.storeId) return prisma.store.findUnique({ where: { id: body.storeId } });
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
    const inventory = await inventoryForCheckout(storeId, item.productId);
    const available = Math.max(0, (inventory?.quantity ?? 0) - (inventory?.reservedQuantity ?? 0));
    if (!inventory || available < item.quantity) return `Stok ${inventory?.product.name ?? item.name} tidak mencukupi`;
  }
  return null;
}

function checkoutProductSelect() {
  return {
    id: true,
    name: true,
    price: true,
    unit: true,
    category: { select: { name: true } },
    discounts: { select: { expiresAt: true, maxDiscount: true, startsAt: true, storeId: true, type: true, value: true } },
    images: { select: { url: true } }
  } as const;
}

async function inventoryForCheckout(storeId: string, productId: string) {
  return prisma.inventory.findUnique({
    where: { storeId_productId: { storeId, productId } },
    select: { quantity: true, reservedQuantity: true, product: { select: { name: true } } }
  }).catch((error) => {
    if (!isCheckoutSchemaMissing(error)) throw error;
    return prisma.inventory.findUnique({
      where: { storeId_productId: { storeId, productId } },
      select: { quantity: true, product: { select: { name: true } } }
    }).then((item) => item ? { ...item, reservedQuantity: 0 } : null);
  });
}

function activeProductDiscount(price: number, discounts: { expiresAt: Date; maxDiscount: number | null; startsAt: Date; storeId: string; type: "PERCENTAGE" | "NOMINAL" | "BOGO"; value: number }[], storeId: string): number {
  const now = Date.now();
  const active = discounts
    .filter((discount) => discount.storeId === storeId && discount.startsAt.getTime() <= now && discount.expiresAt.getTime() > now)
    .map((discount) => {
      if (discount.type === "BOGO") return 0;
      const raw = discount.type === "PERCENTAGE" ? Math.round(price * (discount.value / 100)) : discount.value;
      return discount.maxDiscount ? Math.min(raw, discount.maxDiscount) : raw;
    });
  return Math.min(price, Math.max(0, ...active, 0));
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

function initialPayment(body: CreateOrderBody, orderNo: string): CheckoutPayment {
  const methods = paymentMethodOptions();
  const selected = methods.find((method) => method.id === body.paymentChannel);
  if (!selected) throw new Error("Metode pembayaran tidak tersedia.");
  if (!xenditConfig.hasSecretKey) throw new Error("Konfigurasi Xendit belum lengkap.");
  return { channel: selected.channel, externalId: orderNo, invoiceUrl: null, method: "xendit", orderNumber: orderNo, redirectUrl: null, status: "PENDING" };
}

async function createPaymentSession(input: { amount: number; email: string; items: CheckoutItem[]; orderNumber: string; payment: CheckoutPayment; totals: { discount: number; serviceFee: number; shippingCost: number } }): Promise<CheckoutPayment> {
  const invoice = await createXenditInvoice({
    amount: input.amount,
    customerEmail: input.email,
    description: xenditInvoiceDescription(input.items),
    externalId: input.orderNumber,
    items: xenditItemDetails(input.items, input.totals)
  });
  if (!invoice.invoice_url) throw new Error("Xendit tidak mengembalikan invoice_url.");
  return { ...input.payment, externalId: invoice.id, invoiceUrl: invoice.invoice_url, redirectUrl: invoice.invoice_url, status: invoice.status, token: invoice.id };
}

function shippingMethodOptions() {
  return [
    { id: "standard", label: "Pengiriman Standar", description: "Estimasi reguler dari cabang terdekat.", eta: "2-4 jam", cost: Number(process.env.SHIPPING_STANDARD_COST ?? 10000), requiresAddress: true },
    { id: "express", label: "Pengiriman Express", description: "Prioritas lebih cepat bila cabang tersedia.", eta: "60-120 menit", cost: Number(process.env.SHIPPING_EXPRESS_COST ?? 18000), requiresAddress: true },
    { id: "pickup", label: "Ambil di Cabang", description: "Ambil pesanan langsung di cabang pilihan.", eta: "Sesuai jadwal ambil", cost: 0, requiresAddress: false }
  ];
}

function paymentMethodOptions() {
  if (!xenditConfig.hasSecretKey) return [];
  return [{
    id: "xendit",
    label: "Xendit Test Mode",
    provider: "xendit",
    channel: "",
    description: "Bayar melalui Xendit Payment Link test mode."
  }];
}

async function createCheckoutOrder(input: {
  address: CheckoutAddress | null;
  body: CreateOrderBody;
  deliveryDate: Date;
  items: CheckoutItem[];
  orderNo: string;
  payment: CheckoutPayment;
  paymentDeadline: Date;
  serviceFee: number;
  shipping: Awaited<ReturnType<typeof shippingQuote>>;
  shippingMethod: ReturnType<typeof shippingMethodOptions>[number];
  store: NonNullable<Awaited<ReturnType<typeof resolveStore>>>;
  total: number;
  userId: string;
  voucher: VoucherValidation;
}) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        addressId: input.address?.id,
        addressSnapshot: input.address ? addressSnapshot(input.address) : undefined,
        courierName: input.shipping.provider,
        deliveryDate: input.deliveryDate,
        deliverySlot: input.body.deliverySlot,
        discountTotal: input.voucher.discount,
        estimatedArrival: estimatedArrival(input.deliveryDate, input.shippingMethod.id),
        orderNote: cleanText(input.body.orderNote),
        orderNumber: input.orderNo,
        paymentChannel: input.payment.channel,
        paymentDeadline: input.paymentDeadline,
        paymentExternalId: input.payment.externalId,
        paymentInvoiceUrl: input.payment.invoiceUrl,
        paymentMethod: input.payment.method,
        paymentProvider: input.payment.method,
        paymentRedirectUrl: input.payment.redirectUrl,
        paymentStatus: "PENDING",
        serviceFee: input.serviceFee,
        shippingCost: input.shipping.cost,
        shippingMethod: input.shippingMethod.id,
        shippingProvider: input.shipping.provider,
        status: "PENDING_PAYMENT",
        storeId: input.store.id,
        total: input.total,
        userId: input.userId,
        voucherCode: input.voucher.voucher?.code,
        voucherId: input.voucher.voucher?.id
      },
      select: orderResponseSelect
    });

    await persistOrderSideEffects(tx, { items: input.items, orderId: created.id, orderNumber: created.orderNumber, storeId: input.store.id, userId: input.userId });

    if (input.voucher.voucher && input.voucher.discount > 0) {
      await tx.voucherUsage.create({ data: { code: input.voucher.voucher.code, discount: input.voucher.discount, orderId: created.id, userId: input.userId, voucherId: input.voucher.voucher.id } });
    }

    await tx.orderStatusHistory.create({ data: { orderId: created.id, status: "PENDING_PAYMENT", description: "Pesanan dibuat, stok di-reserve, dan menunggu pembayaran." } });
    logBusinessEvent("ORDER_CREATED", { orderId: created.id, orderNumber: created.orderNumber, total: input.total, userId: input.userId });
    return created;
  });
}

async function createLegacyCheckoutOrder(input: { items: CheckoutItem[]; orderNo: string; paymentDeadline: Date; shippingCost: number; storeId: string; total: number; userId: string }): Promise<CheckoutOrderResult> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber: input.orderNo,
        paymentDeadline: input.paymentDeadline,
        paymentStatus: "PENDING",
        shippingCost: input.shippingCost,
        status: "WAITING_PAYMENT",
        storeId: input.storeId,
        total: input.total,
        userId: input.userId
      },
      select: orderResponseSelect
    });
    await persistLegacyOrderSideEffects(tx, { items: input.items, orderId: created.id, orderNumber: created.orderNumber, storeId: input.storeId, userId: input.userId });
    return created;
  }).catch((error) => {
    if (!isCheckoutSchemaMissing(error)) throw error;
    return createBareLegacyCheckoutOrder(input);
  });
}

async function createBareLegacyCheckoutOrder(input: { items: CheckoutItem[]; orderNo: string; paymentDeadline: Date; shippingCost: number; storeId: string; total: number; userId: string }): Promise<CheckoutOrderResult> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber: input.orderNo,
        paymentDeadline: input.paymentDeadline,
        shippingCost: input.shippingCost,
        status: "WAITING_PAYMENT",
        storeId: input.storeId,
        total: input.total,
        userId: input.userId
      },
      select: bareOrderResponseSelect
    });
    await persistLegacyOrderSideEffects(tx, { items: input.items, orderId: created.id, orderNumber: created.orderNumber, storeId: input.storeId, userId: input.userId });
    return withPaymentStatus(created, "PENDING");
  });
}

async function attachPaymentSessionToOrder(orderId: string, session: CheckoutPayment): Promise<CheckoutOrderResult> {
  return prisma.order.update({
    where: { id: orderId },
    data: {
      paymentExternalId: session.token ?? session.externalId,
      paymentInvoiceUrl: session.redirectUrl,
      paymentProvider: session.method,
      paymentRedirectUrl: session.redirectUrl,
      paymentStatus: "PENDING",
      xenditInvoiceId: session.method === "xendit" ? session.externalId : undefined,
      xenditInvoiceStatus: session.method === "xendit" ? session.status : undefined
    },
    select: orderResponseSelect
  }).catch((error) => {
    if (!isCheckoutSchemaMissing(error)) throw error;
    return prisma.order.update({
      where: { id: orderId },
      data: {
        paymentChannel: session.channel,
        paymentExternalId: session.token ?? session.externalId,
        paymentInvoiceUrl: session.redirectUrl,
        paymentMethod: session.method,
        paymentRedirectUrl: session.redirectUrl,
        paymentStatus: "PENDING"
      },
      select: orderResponseSelect
    });
  }).catch((error) => {
    if (!isCheckoutSchemaMissing(error)) throw error;
    return prisma.order.update({
      where: { id: orderId },
      data: {
        paymentChannel: session.channel,
        paymentExternalId: session.token ?? session.externalId,
        paymentInvoiceUrl: session.redirectUrl,
        paymentMethod: session.method
      },
      select: bareOrderResponseSelect
    }).then((order) => withPaymentStatus(order, "PENDING"));
  }).catch((error) => {
    if (!isCheckoutSchemaMissing(error)) throw error;
    return prisma.order.update({
      where: { id: orderId },
      data: {
        paymentExternalId: session.token ?? session.externalId,
        paymentStatus: "PENDING"
      },
      select: orderResponseSelect
    });
  }).catch((error) => {
    if (!isCheckoutSchemaMissing(error)) throw error;
    return prisma.order.findUnique({ where: { id: orderId }, select: bareOrderResponseSelect }).then((order) => {
      if (!order) throw error;
      return withPaymentStatus(order, "PENDING");
    });
  });
}

async function persistOrderSideEffects(tx: Prisma.TransactionClient, input: { items: CheckoutItem[]; orderId: string; orderNumber: string; storeId: string; userId: string }) {
  for (const item of input.items) {
    await tx.orderItem.create({
      data: {
        discount: item.discount,
        finalPrice: item.finalPrice,
        imageUrl: item.imageUrl,
        orderId: input.orderId,
        price: item.price,
        productId: item.productId,
        productName: item.name,
        quantity: item.quantity,
        sku: item.sku,
        subtotal: item.subtotal
      }
    });
    const reserved = await tx.$executeRaw`
      UPDATE "Inventory"
      SET "reservedQuantity" = "reservedQuantity" + ${item.quantity}
      WHERE "storeId" = ${input.storeId}
        AND "productId" = ${item.productId}
        AND ("quantity" - "reservedQuantity") >= ${item.quantity}
    `;
    if (reserved !== 1) throw new Error(`Stok ${item.name} tidak mencukupi`);
    await tx.stockJournal.create({ data: { storeId: input.storeId, productId: item.productId, change: item.quantity, note: `RESERVATION ${input.orderNumber}` } });
    logBusinessEvent("STOCK_RESERVED", { orderNumber: input.orderNumber, productId: item.productId, quantity: item.quantity, storeId: input.storeId });
  }

  await tx.order.update({ where: { id: input.orderId }, data: { stockReservedAt: new Date() } });

  const cartIds = input.items.map((item) => item.cartId).filter((id): id is string => Boolean(id));
  if (cartIds.length) await tx.cartItem.deleteMany({ where: { id: { in: cartIds }, userId: input.userId } });
  else await tx.cartItem.deleteMany({ where: { userId: input.userId, storeId: input.storeId, productId: { in: input.items.map((item) => item.productId) } } });
}

async function persistLegacyOrderSideEffects(tx: Prisma.TransactionClient, input: { items: CheckoutItem[]; orderId: string; orderNumber: string; storeId: string; userId: string }) {
  for (const item of input.items) {
    await tx.orderItem.create({ data: { orderId: input.orderId, productId: item.productId, quantity: item.quantity, price: item.finalPrice || item.price } });
    await tx.inventory.update({ where: { storeId_productId: { storeId: input.storeId, productId: item.productId } }, data: { quantity: { decrement: item.quantity } } });
    await tx.stockJournal.create({ data: { storeId: input.storeId, productId: item.productId, change: -item.quantity, note: `Order ${input.orderNumber}` } });
  }

  const cartIds = input.items.map((item) => item.cartId).filter((id): id is string => Boolean(id));
  if (cartIds.length) await tx.cartItem.deleteMany({ where: { id: { in: cartIds }, userId: input.userId } });
  else await tx.cartItem.deleteMany({ where: { userId: input.userId, storeId: input.storeId, productId: { in: input.items.map((item) => item.productId) } } });
}

async function markPaymentSessionFailed(orderId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) return;
    if (!order.stockReleasedAt && !order.stockCommittedAt) {
      for (const item of order.items) {
        await tx.inventory.update({ where: { storeId_productId: { storeId: order.storeId, productId: item.productId } }, data: { reservedQuantity: { decrement: item.quantity } } });
        await tx.stockJournal.create({ data: { storeId: order.storeId, productId: item.productId, change: -item.quantity, note: `RELEASE sesi pembayaran ${order.orderNumber}` } });
      }
    }
    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "FAILED",
        paymentStockRestoredAt: order.paymentStockRestoredAt ?? new Date(),
        stockReleasedAt: order.stockReleasedAt ?? new Date(),
        status: "CANCELLED"
      }
    });
    if (order.status !== "CANCELLED") {
      await tx.orderStatusHistory.create({ data: { orderId: order.id, status: "CANCELLED", description: "Sesi pembayaran Xendit gagal dibuat." } });
    }
  }).catch((error) => {
    if (!isCheckoutSchemaMissing(error)) throw error;
    return markLegacyPaymentSessionFailed(orderId);
  });
}

async function markLegacyPaymentSessionFailed(orderId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        storeId: true,
        items: { select: { productId: true, quantity: true } }
      }
    });
    if (!order) return;
    for (const item of order.items) {
      await tx.inventory.update({ where: { storeId_productId: { storeId: order.storeId, productId: item.productId } }, data: { quantity: { increment: item.quantity } } });
      await tx.stockJournal.create({ data: { storeId: order.storeId, productId: item.productId, change: item.quantity, note: `RESTORE sesi pembayaran ${order.orderNumber}` } });
    }
    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "FAILED",
        status: "CANCELLED"
      }
    }).catch((error) => {
      if (!isCheckoutSchemaMissing(error)) throw error;
      return tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    });
  });
}

const orderResponseSelect = {
  createdAt: true,
  id: true,
  orderNumber: true,
  paymentDeadline: true,
  paymentRedirectUrl: true,
  paymentStatus: true,
  shippingCost: true,
  status: true,
  storeId: true,
  total: true,
  updatedAt: true,
  userId: true
} satisfies Prisma.OrderSelect;

const bareOrderResponseSelect = {
  id: true,
  orderNumber: true,
  status: true
} satisfies Prisma.OrderSelect;

function withPaymentStatus<T extends { id: string; orderNumber: string; status: string }>(order: T, paymentStatus: string): T & { paymentStatus: string } {
  return { ...order, paymentStatus };
}

function canAccessOrder(req: Request, order: { storeId: string; userId: string }) {
  if (req.user?.role === "super_admin") return true;
  if (req.user?.role === "store_admin") return Boolean(req.user.storeId && req.user.storeId === order.storeId);
  return req.user?.id === order.userId;
}

function invoicePayload(order: Prisma.OrderGetPayload<{ include: { items: { include: { product: { include: { images: true } } } }; store: true; user: true } }>) {
  if (order.invoiceSnapshot && typeof order.invoiceSnapshot === "object") return order.invoiceSnapshot;
  const address = (order.addressSnapshot ?? {}) as Record<string, unknown>;
  return {
    invoiceNumber: order.invoiceNumber ?? `INV-${order.orderNumber}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus,
    orderStatus: order.status,
    customer: {
      id: order.user.id,
      name: order.user.name,
      email: order.user.email,
      phone: order.user.phone
    },
    store: {
      id: order.store.id,
      name: order.store.name,
      city: order.store.city
    },
    address,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.productName || item.product.name,
      sku: item.sku,
      image: item.imageUrl ?? item.product.images[0]?.url ?? null,
      quantity: item.quantity,
      unitPrice: item.price,
      discount: item.discount,
      finalPrice: item.finalPrice || item.price,
      subtotal: item.subtotal || item.price * item.quantity
    })),
    subtotal: order.items.reduce((sum, item) => sum + (item.subtotal || item.price * item.quantity), 0),
    shippingCost: order.shippingCost,
    serviceFee: order.serviceFee,
    discount: order.discountTotal,
    grandTotal: order.total,
    paymentMethod: order.paymentMethod,
    paymentChannel: order.paymentChannel,
    transactionId: order.xenditInvoiceId ?? order.paymentExternalId,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paymentStatus === "PAID" ? order.paidAt?.toISOString() ?? null : null
  };
}

function isCheckoutSchemaMissing(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("does not exist in the current database") || message.includes("column") || message.includes("P2022") || message.includes("OrderStatusHistory") || message.includes("VoucherUsage") || message.includes("addressId") || message.includes("paymentInvoiceUrl");
}

function xenditItemDetails(items: CheckoutItem[], totals: { discount: number; serviceFee: number; shippingCost: number }): XenditInvoiceItem[] {
  const details: XenditInvoiceItem[] = items.map((item) => ({
    name: item.name.slice(0, 255),
    price: item.finalPrice,
    quantity: item.quantity,
    category: item.category
  }));
  if (totals.shippingCost > 0) details.push({ name: "Biaya pengiriman", price: totals.shippingCost, quantity: 1, category: "Shipping" });
  if (totals.serviceFee > 0) details.push({ name: "Biaya layanan", price: totals.serviceFee, quantity: 1, category: "Service Fee" });
  return details;
}

function xenditInvoiceDescription(items: CheckoutItem[]): string {
  const products = items.map((item) => `${item.name} - ${item.productId}`);
  if (!products.length) return "Market-Snap order";
  const [first, ...rest] = products;
  const suffix = rest.length ? ` + ${rest.length} produk lainnya` : "";
  return `${first}${suffix}`.slice(0, 255);
}

async function findCheckoutAddress(addressId: string | undefined, userId: string): Promise<CheckoutAddress | null> {
  if (!addressId) return null;
  return prisma.address.findFirst({
    where: { id: addressId, userId },
    select: {
      detail: true,
      id: true,
      label: true,
      latitude: true,
      longitude: true
    }
  });
}

function addressSnapshot(address: CheckoutAddress) {
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
  const statuses: Record<string, OrderStatus> = {
    "Menunggu Pembayaran": "PENDING_PAYMENT",
    "Menunggu Konfirmasi Pembayaran": "PENDING_PAYMENT",
    "Pembayaran Berhasil": "PAID",
    Diproses: "PROCESSING",
    "Picking Produk": "PICKING",
    Dikemas: "PACKED",
    "Siap Dikirim": "READY",
    "Dalam Pengiriman": "OUT_FOR_DELIVERY",
    Dikirim: "OUT_FOR_DELIVERY",
    Terkirim: "DELIVERED",
    Selesai: "COMPLETED",
    "Pesanan Dikonfirmasi": "CONFIRMED",
    Dibatalkan: "CANCELLED",
    Refunded: "REFUNDED"
  };
  return statuses[value] ?? (value as OrderStatus);
}

function historyDescription(status: OrderStatus) {
  const descriptions: Record<OrderStatus, string> = {
    CANCELLED: "Pesanan dibatalkan.",
    COMPLETED: "Pesanan telah selesai.",
    DELIVERED: "Pesanan sudah diterima pelanggan.",
    CONFIRMED: "Pesanan telah diterima pelanggan.",
    OUT_FOR_DELIVERY: "Pesanan sedang dalam pengiriman.",
    PACKED: "Pesanan sudah dikemas.",
    PAID: "Pembayaran berhasil diterima.",
    PENDING_PAYMENT: "Pesanan menunggu pembayaran.",
    PICKING: "Produk sedang diambil dari rak.",
    PROCESSING: "Pesanan sedang diproses cabang.",
    READY: "Pesanan siap dikirim atau diambil.",
    REFUNDED: "Pesanan dikembalikan dan refund diproses.",
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
  if (!deliverySlots.includes(slot)) return true;
  const end = slot.split("-").at(-1)?.trim() ?? "";
  const [hours = "0", minutes = "0"] = end.split(":");
  const scheduledEnd = new Date(date);
  scheduledEnd.setHours(Number(hours), Number(minutes), 0, 0);
  return scheduledEnd.getTime() <= Date.now();
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}
