import type { Request, Response } from "express";
import { hashPassword, signToken, verifyPassword } from "../config/auth.js";
import { googleOAuthEnabled, passport } from "../config/passport.js";
import { prisma } from "../config/prisma.js";
import type { User } from "../types/market.js";
import { handleControllerError, mapUser } from "../utils/controllerHelpers.js";

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const exists = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (exists) {
      res.status(409).json({ message: "Email sudah terdaftar" });
      return;
    }
    const referralCode = cleanOptional(req.body.referralCode);
    const user = await prisma.user.create({
      data: {
        name: req.body.name,
        email: req.body.email,
        passwordHash: hashPassword(req.body.password),
        referralCode,
        role: "USER",
        isActive: true
      }
    });
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

export function googleLogin(req: Request, res: Response): void {
  if (!googleOAuthEnabled) {
    res.status(503).json({ message: "Google OAuth belum dikonfigurasi" });
    return;
  }
  passport.authenticate("google", { scope: ["profile", "email"], session: false })(req, res);
}

export function googleCallback(req: Request, res: Response): void {
  if (!googleOAuthEnabled) {
    redirectToWeb(res, "Google OAuth belum dikonfigurasi");
    return;
  }

  passport.authenticate("google", { session: false }, (error: unknown, user?: User) => {
    if (error || !user) {
      redirectToWeb(res, error instanceof Error ? error.message : "Login Google gagal");
      return;
    }
    const token = signToken({ sub: user.id, role: user.role });
    const params = new URLSearchParams({ token });
    res.redirect(`${webOrigin()}/auth/google/callback?${params.toString()}`);
  })(req, res);
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

function webOrigin() {
  return (process.env.WEB_ORIGIN?.split(",")[0] ?? "https://market-snap.vercel.app").trim().replace(/\/+$/, "");
}

function redirectToWeb(res: Response, message: string): void {
  const params = new URLSearchParams({ error: message });
  res.redirect(`${webOrigin()}/auth/google/callback?${params.toString()}`);
}
