import type { Request, Response } from "express";
import { signToken, verifyPassword } from "../config/auth.js";
import { prisma } from "../config/prisma.js";
import { handleControllerError, mapUser } from "../utils/controllerHelpers.js";

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const exists = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (exists) {
      res.status(409).json({ message: "Email sudah terdaftar" });
      return;
    }
    const referralCode = cleanOptional(req.body.referralCode);
    const user = await prisma.user.create({ data: { name: req.body.name, email: req.body.email, referralCode, role: "USER", isActive: true } });
    res.status(201).json({ data: mapUser(user), verificationExpiresInMinutes: 60 });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (!user || !verifyPassword(req.body.password, user.passwordHash ?? user.password)) {
      res.status(401).json({ message: "Email atau password salah" });
      return;
    }
    res.json({ token: signToken({ sub: user.id, role: user.role }), user: mapUser(user) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(404).json({ message: "User tidak ditemukan" });
      return;
    }
    res.json({ data: req.user });
  } catch (error) {
    handleControllerError(res, error);
  }
}

function cleanOptional(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

export function uploadAvatar(req: Request, res: Response): void {
  try {
    if (!req.file) {
      res.status(400).json({ message: "File avatar wajib diupload" });
      return;
    }
    res.json({ message: "Avatar tervalidasi dan siap dikirim ke Cloudinary", file: { name: req.file.originalname, size: req.file.size, type: req.file.mimetype } });
  } catch (error) {
    handleControllerError(res, error);
  }
}
