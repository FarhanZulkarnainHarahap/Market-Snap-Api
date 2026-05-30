import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { handleControllerError } from "../utils/controllerHelpers.js";

export async function getAddresses(req: Request, res: Response): Promise<void> {
  try {
    const addresses = await prisma.address.findMany({ where: { userId: req.user?.id }, orderBy: { createdAt: "desc" } });
    res.json({ data: addresses });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function createAddress(req: Request, res: Response): Promise<void> {
  try {
    if (req.body.isPrimary) await prisma.address.updateMany({ where: { userId: req.user?.id }, data: { isPrimary: false } });
    const address = await prisma.address.create({ data: { userId: String(req.user?.id), label: req.body.label, detail: req.body.detail, latitude: Number(req.body.lat), longitude: Number(req.body.lng), isPrimary: Boolean(req.body.isPrimary) } });
    res.status(201).json({ data: address });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateAddress(req: Request, res: Response): Promise<void> {
  try {
    if (req.body.isPrimary) await prisma.address.updateMany({ where: { userId: req.user?.id }, data: { isPrimary: false } });
    const address = await prisma.address.update({ where: { id: String(req.params.id) }, data: addressData(req.body) });
    res.json({ data: address });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function deleteAddress(req: Request, res: Response): Promise<void> {
  try {
    const address = await prisma.address.delete({ where: { id: String(req.params.id) } });
    res.json({ message: "Alamat berhasil dihapus", data: address });
  } catch (error) {
    handleControllerError(res, error);
  }
}

function addressData(body: Record<string, unknown>) {
  return { label: body.label as string | undefined, detail: body.detail as string | undefined, latitude: body.lat === undefined ? undefined : Number(body.lat), longitude: body.lng === undefined ? undefined : Number(body.lng), isPrimary: body.isPrimary as boolean | undefined };
}
