export type Store = {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  radiusKm: number;
  isMain: boolean;
  adminId: string;
  distanceKm?: number;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  discount: string | null;
  organic: boolean;
  image: string;
  description?: string;
};

export type Inventory = {
  storeId: string;
  productId: string;
  quantity: number;
};

export type ProductWithStock = Product & { stock: number };

export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  authProvider?: string;
  canEditAvatar?: boolean;
  createdAt?: string;
  role: "customer" | "super_admin" | "store_admin";
  verified: boolean;
  password?: string;
  referralCode?: string;
  storeId?: string;
};

export type Address = {
  id: string;
  userId: string;
  label: string;
  detail: string;
  lat: number;
  lng: number;
  isPrimary: boolean;
};

export type CartItem = {
  id: string;
  userId: string;
  productId: string;
  storeId: string;
  quantity: number;
  createdAt: string;
  updatedAt?: string;
};

export type Voucher = {
  id: string;
  title: string;
  code: string;
  type: "cart" | "shipping" | "product";
  discountType: "percentage" | "nominal";
  value: number;
  maxDiscount: number;
  minSpend: number;
  expiresAt: string;
};

export type Order = {
  id: string;
  userId: string;
  storeId: string;
  status: string;
  total: number;
  createdAt: string;
  items?: unknown[];
  paymentDeadline?: string;
  updatedAt?: string;
};
