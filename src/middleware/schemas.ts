import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  referralCode: z.preprocess((value) => value === "" ? undefined : value, z.string().optional())
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email()
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8)
});

export const createOrderSchema = z.object({
  userId: z.string().optional(),
  total: z.coerce.number().nonnegative().optional(),
  items: z.array(z.unknown()).default([]),
  selectedCartItemIds: z.array(z.string().min(1)).optional(),
  addressId: z.string().min(1).optional(),
  location: z.record(z.string(), z.unknown()).optional(),
  destinationId: z.string().optional(),
  courier: z.string().optional(),
  shippingMethod: z.string().optional(),
  deliveryDate: z.string().optional(),
  deliverySlot: z.string().optional(),
  voucherCode: z.string().optional(),
  weightGram: z.coerce.number().positive().optional(),
  paymentMethod: z.enum(["manual_transfer", "xendit"]).optional(),
  paymentChannel: z.string().optional(),
  orderNote: z.string().max(500).optional(),
  storeId: z.string().optional()
});

export const validateVoucherSchema = z.object({
  code: z.string().min(2),
  selectedCartItemIds: z.array(z.string().min(1)).optional()
});

export const updateOrderStatusSchema = z.object({
  status: z.string().min(2)
});

export const updateOrderSchema = z.object({
  total: z.coerce.number().nonnegative().optional(),
  status: z.string().min(2).optional(),
  items: z.array(z.unknown()).optional()
});

export const addCartItemSchema = z.object({
  productId: z.string().min(1),
  storeId: z.string().min(1).optional(),
  quantity: z.coerce.number().int().positive().default(1)
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().positive()
});

export const createProductSchema = z.object({
  name: z.string().min(2),
  category: z.string().min(2),
  price: z.coerce.number().positive(),
  unit: z.string().min(1),
  discount: z.string().nullable().optional(),
  organic: z.coerce.boolean().default(false),
  image: z.string().url().optional(),
  description: z.string().optional()
});

export const updateProductSchema = createProductSchema.partial();

export const createAddressSchema = z.object({
  label: z.string().min(2),
  recipientName: z.string().min(2).optional(),
  phone: z.string().min(8).max(20).optional(),
  detail: z.string().min(5),
  district: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  note: z.string().optional(),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  isPrimary: z.coerce.boolean().default(false)
});

export const updateAddressSchema = createAddressSchema.partial();

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(8).max(20).optional(),
  password: z.string().min(8).optional(),
  avatarUrl: z.string().url().optional(),
  role: z.enum(["customer", "super_admin", "store_admin"]).optional(),
  verified: z.coerce.boolean().optional()
});

export const emailVerificationRequestSchema = z.object({
  email: z.string().email()
});

export const emailVerificationConfirmSchema = z.object({
  token: z.string().min(20)
});

export const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(["customer", "super_admin", "store_admin"]).default("store_admin"),
  verified: z.coerce.boolean().default(false)
});

export const createStoreSchema = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radiusKm: z.coerce.number().positive(),
  isMain: z.coerce.boolean().optional(),
  adminId: z.string().min(1)
});

export const createDiscountSchema = z.object({
  code: z.string().min(3).optional(),
  title: z.string().min(2),
  type: z.enum(["cart", "shipping", "product"]).default("cart"),
  discountType: z.enum(["percentage", "nominal"]),
  value: z.coerce.number().positive(),
  maxDiscount: z.coerce.number().nonnegative().default(0),
  minSpend: z.coerce.number().nonnegative().default(0),
  expiresAt: z.string().min(8)
});
