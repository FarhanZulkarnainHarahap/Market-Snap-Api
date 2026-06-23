import type { Request, Response } from "express";
import { hashPassword } from "../config/auth.js";
import { prisma } from "../config/prisma.js";
import { handleControllerError, mapUser, paginate, prismaRole } from "../utils/controllerHelpers.js";

export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.user?.id) } });
    if (!user) {
      res.status(404).json({ message: "User tidak ditemukan" });
      return;
    }
    res.json({ data: mapUser(user) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    const user = await prisma.user.update({ where: { id: String(req.user?.id) }, data: profileData(req.body) });
    res.json({ data: mapUser(user) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getUsers(req: Request, res: Response): Promise<void> {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ ...paginate(users.map(mapUser), req.query.page, req.query.limit) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    const exists = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (exists) {
      res.status(409).json({ message: "Email sudah terdaftar" });
      return;
    }
    const user = await prisma.user.create({
      data: {
        name: req.body.name,
        email: req.body.email,
        passwordHash: req.body.password ? hashPassword(req.body.password) : undefined,
        role: prismaRole(req.body.role),
        isActive: true,
        verifiedAt: req.body.verified ? new Date() : null
      }
    });
    res.status(201).json({ data: mapUser(user) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    const user = await prisma.user.update({ where: { id: String(req.params.id) }, data: profileData(req.body) });
    res.json({ data: mapUser(user) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  try {
    const user = await prisma.user.delete({ where: { id: String(req.params.id) } });
    res.json({ message: "User berhasil dihapus", data: mapUser(user) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

function profileData(body: Record<string, unknown>) {
  const password = typeof body.password === "string" && body.password ? body.password : undefined;
  return {
    name: body.name as string | undefined,
    email: body.email as string | undefined,
    password: password ? null : undefined,
    passwordHash: password ? hashPassword(password) : undefined,
    role: body.role ? prismaRole(String(body.role)) : undefined,
    verifiedAt: body.verified === undefined ? undefined : body.verified ? new Date() : null
  };
}
