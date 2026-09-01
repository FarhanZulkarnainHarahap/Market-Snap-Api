import { z } from "zod";

const strongPassword = z.string()
  .min(8, "Password minimal 8 karakter")
  .max(128)
  .regex(/[a-z]/, "Password harus memiliki huruf kecil")
  .regex(/[A-Z]/, "Password harus memiliki huruf besar")
  .regex(/[0-9]/, "Password harus memiliki angka");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: strongPassword,
  referralCode: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().max(40).optional())
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128)
}).strict();

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254)
}).strict();

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20),
  password: strongPassword
}).strict();

export const createPaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.coerce.number().int().positive(),
  customer: z.object({
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    name: z.string().trim().min(1).max(100).optional()
  }).strict().optional()
}).strict();

export const createOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().int().positive().max(1000)
  })).max(100).default([]),
  selectedCartItemIds: z.array(z.string().min(1)).max(100).optional(),
  addressId: z.string().min(1).optional(),
  location: z.record(z.string(), z.unknown()).optional(),
  destinationId: z.string().optional(),
  courier: z.string().optional(),
  shippingMethod: z.string().optional(),
  deliveryDate: z.string().optional(),
  deliverySlot: z.string().optional(),
  voucherCode: z.string().optional(),
  weightGram: z.coerce.number().positive().optional(),
  paymentMethod: z.enum(["xendit"]).optional(),
  paymentChannel: z.string().optional(),
  orderNote: z.string().max(500).optional(),
  storeId: z.string().optional(),
  termsAccepted: z.literal(true)
}).strict();

export const validateVoucherSchema = z.object({
  code: z.string().min(2),
  selectedCartItemIds: z.array(z.string().min(1)).optional()
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["PICKING", "PACKED", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED", "PROCESSING", "SHIPPED", "CONFIRMED"]),
  location: z.string().trim().max(200).optional()
}).strict();

export const updateOrderSchema = updateOrderStatusSchema;

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
  password: strongPassword.optional(),
  avatarUrl: z.string().url().optional(),
  role: z.enum(["customer", "super_admin", "store_admin"]).optional(),
  verified: z.coerce.boolean().optional()
}).strict();

export const createStoreAdminRequestSchema = z.object({
  requestedStoreId: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  reason: z.string().trim().min(20).max(700),
  experience: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().max(700).optional())
});

export const approveStoreAdminRequestSchema = z.object({
  storeId: z.string().min(1)
});

export const rejectStoreAdminRequestSchema = z.object({
  reason: z.string().trim().min(5).max(500)
});

export const emailVerificationRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254)
}).strict();

export const emailVerificationConfirmSchema = z.object({
  token: z.string().min(20)
}).strict();

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

export const contactMessageSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  subject: z.enum(["ORDER", "PAYMENT", "PRODUCT", "PARTNERSHIP", "OTHER"]),
  message: z.string().trim().min(10).max(2000),
  website: z.literal("").optional()
}).strict();
