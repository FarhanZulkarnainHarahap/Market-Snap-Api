import type { Request, Response } from "express";
import type { Prisma } from "../../prisma/generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { handleControllerError } from "../utils/controllerHelpers.js";

const legacyAddressSelect = {
  createdAt: true,
  detail: true,
  id: true,
  isPrimary: true,
  label: true,
  latitude: true,
  longitude: true,
  updatedAt: true,
  userId: true
} satisfies Prisma.AddressSelect;

export async function getAddresses(req: Request, res: Response): Promise<void> {
  try {
    const addresses = await prisma.address.findMany({ where: { userId: req.user?.id }, orderBy: { createdAt: "desc" } }).catch((error) => {
      if (!isMissingAddressColumn(error)) throw error;
      return prisma.address.findMany({ where: { userId: req.user?.id }, orderBy: { createdAt: "desc" }, select: legacyAddressSelect });
    });
    res.json({ data: addresses });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function createAddress(req: Request, res: Response): Promise<void> {
  try {
    if (req.body.isPrimary) await prisma.address.updateMany({ where: { userId: req.user?.id }, data: { isPrimary: false } });
    const address = await prisma.address.create({ data: createAddressData(req.body, String(req.user?.id)) }).catch((error) => {
      if (!isMissingAddressColumn(error)) throw error;
      return prisma.address.create({ data: createLegacyAddressData(req.body, String(req.user?.id)), select: legacyAddressSelect });
    });
    res.status(201).json({ data: address });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateAddress(req: Request, res: Response): Promise<void> {
  try {
    const exists = await prisma.address.findFirst({ where: { id: String(req.params.id), userId: req.user?.id }, select: legacyAddressSelect });
    if (!exists) {
      res.status(404).json({ message: "Alamat tidak ditemukan" });
      return;
    }
    if (req.body.isPrimary) await prisma.address.updateMany({ where: { userId: req.user?.id }, data: { isPrimary: false } });
    const address = await prisma.address.update({ where: { id: String(req.params.id) }, data: addressData(req.body) }).catch((error) => {
      if (!isMissingAddressColumn(error)) throw error;
      return prisma.address.update({ where: { id: String(req.params.id) }, data: legacyAddressData(req.body), select: legacyAddressSelect });
    });
    res.json({ data: address });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function deleteAddress(req: Request, res: Response): Promise<void> {
  try {
    const exists = await prisma.address.findFirst({ where: { id: String(req.params.id), userId: req.user?.id }, select: legacyAddressSelect });
    if (!exists) {
      res.status(404).json({ message: "Alamat tidak ditemukan" });
      return;
    }
    await prisma.address.delete({ where: { id: String(req.params.id) }, select: { id: true } });
    res.json({ message: "Alamat berhasil dihapus", data: exists });
  } catch (error) {
    handleControllerError(res, error);
  }
}

function addressData(body: Record<string, unknown>, creating = false) {
  return {
    label: text(body.label),
    recipientName: text(body.recipientName),
    phone: text(body.phone),
    detail: text(body.detail),
    district: text(body.district),
    city: text(body.city),
    province: text(body.province),
    postalCode: text(body.postalCode),
    note: text(body.note),
    latitude: body.lat === undefined ? undefined : Number(body.lat),
    longitude: body.lng === undefined ? undefined : Number(body.lng),
    isPrimary: creating ? undefined : body.isPrimary as boolean | undefined
  };
}

function createAddressData(body: Record<string, unknown>, userId: string) {
  return {
    ...addressData(body, true),
    detail: String(body.detail ?? "").trim(),
    isPrimary: Boolean(body.isPrimary),
    label: String(body.label ?? "").trim(),
    latitude: Number(body.lat),
    longitude: Number(body.lng),
    userId
  };
}

function createLegacyAddressData(body: Record<string, unknown>, userId: string) {
  return {
    detail: String(body.detail ?? "").trim(),
    isPrimary: Boolean(body.isPrimary),
    label: String(body.label ?? "").trim(),
    latitude: Number(body.lat),
    longitude: Number(body.lng),
    userId
  };
}

function legacyAddressData(body: Record<string, unknown>) {
  return {
    detail: text(body.detail),
    isPrimary: body.isPrimary as boolean | undefined,
    label: text(body.label),
    latitude: body.lat === undefined ? undefined : Number(body.lat),
    longitude: body.lng === undefined ? undefined : Number(body.lng)
  };
}

function isMissingAddressColumn(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("does not exist in the current database") || message.includes("column") || message.includes("recipientName");
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}
