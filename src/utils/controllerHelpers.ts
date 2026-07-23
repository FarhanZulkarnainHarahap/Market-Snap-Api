import type { Response } from "express";
import type { Role, Store as PrismaStore, User as PrismaUser } from "../../prisma/generated/prisma/client.js";
import { distanceKm } from "./distance.js";
import type { Store, User } from "../types/market.js";

type QueryLike = Record<string, unknown>;

export function handleControllerError(res: Response, error: unknown): void {
  if (process.env.NODE_ENV !== "production" && error instanceof Error) {
    console.error(error.message);
  }
  res.status(500).json({ message: publicErrorMessage(error) });
}

export function publicErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("prisma.") || message.includes("Prisma") || message.includes("does not exist in the current database") || message.includes("column") || message.includes("constraint")) {
    return "Data belum dapat diproses. Coba lagi sebentar atau hubungi bantuan Market Snap.";
  }
  return message || "Terjadi kesalahan server";
}

export function apiRole(role: Role): User["role"] {
  if (role === "SUPER_ADMIN") return "super_admin";
  if (role === "STORE_ADMIN") return "store_admin";
  return "customer";
}

export function prismaRole(role?: string): Role {
  if (role === "super_admin") return "SUPER_ADMIN";
  if (role === "store_admin") return "STORE_ADMIN";
  return "CUSTOMER";
}

export function mapUser(user: PrismaUser): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? undefined,
    avatarUrl: user.avatarUrl ?? undefined,
    authProvider: user.authProvider,
    canEditAvatar: Boolean(user.passwordHash || user.password),
    createdAt: user.createdAt.toISOString(),
    referralCode: user.referralCode ?? undefined,
    role: apiRole(user.role),
    storeId: user.storeId ?? undefined,
    verified: Boolean(user.verifiedAt)
  };
}

export function mapStore(store: PrismaStore, location?: { lat: number; lng: number }): Store {
  const base = {
    id: store.id,
    name: store.name,
    city: store.city,
    lat: store.latitude,
    lng: store.longitude,
    radiusKm: store.radiusKm,
    isMain: store.isMain,
    adminId: ""
  };
  return location ? { ...base, distanceKm: distanceKm(location, base) } : base;
}

export function paginate<T>(items: T[], page: unknown = 1, limit: unknown = 8) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 50);
  const start = (safePage - 1) * safeLimit;
  return { data: items.slice(start, start + safeLimit), meta: { page: safePage, limit: safeLimit, total: items.length } };
}

export function locationFromQuery(query: QueryLike) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
}

export function orderNumber(): string {
  const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  return `ORD-${date}-${Date.now().toString().slice(-4)}`;
}
