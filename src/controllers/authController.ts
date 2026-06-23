import type { Request, Response } from "express";
import { hashPassword, signToken, verifyPassword } from "../config/auth.js";
import {
  authJsFacebookSignInUrl,
  authJsGoogleSignInUrl,
  facebookCallbackUrl,
  facebookOAuthEnabled,
  googleCallbackUrl,
  googleOAuthEnabled,
  webOrigin
} from "../config/authjs.js";
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
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(404).json({ message: "User tidak ditemukan" });
      return;
    }
    res.json({ data: mapUser(user) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export function googleLogin(req: Request, res: Response): void {
  if (!googleOAuthEnabled) {
    res.status(503).json({ message: "Google OAuth belum dikonfigurasi" });
    return;
  }
  const callbackUrl = cleanWebCallbackUrl(req.query.callbackUrl, "google");
  res.type("html").send(autoSubmitOAuthForm(authJsGoogleSignInUrl(), callbackUrl));
}

export function googleCallback(_req: Request, res: Response): void {
  if (!googleOAuthEnabled) {
    res.redirect(googleCallbackUrl({ error: "Google OAuth belum dikonfigurasi" }));
    return;
  }
  res.redirect(authJsGoogleSignInUrl());
}

export function facebookLogin(req: Request, res: Response): void {
  if (!facebookOAuthEnabled) {
    res.status(503).json({ message: "Facebook OAuth belum dikonfigurasi" });
    return;
  }
  const callbackUrl = cleanWebCallbackUrl(req.query.callbackUrl, "facebook");
  res.type("html").send(autoSubmitOAuthForm(authJsFacebookSignInUrl(), callbackUrl));
}

export function facebookCallback(_req: Request, res: Response): void {
  if (!facebookOAuthEnabled) {
    res.redirect(facebookCallbackUrl({ error: "Facebook OAuth belum dikonfigurasi" }));
    return;
  }
  res.redirect(authJsFacebookSignInUrl());
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

function cleanWebCallbackUrl(value: unknown, provider: "facebook" | "google"): string {
  const fallback = `${webOrigin()}/auth/${provider}/callback`;
  if (typeof value !== "string") return fallback;
  try {
    const url = new URL(value);
    return url.origin === webOrigin() ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function autoSubmitOAuthForm(action: string, callbackUrl: string): string {
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Menghubungkan akun...</title>
  </head>
  <body>
    <form id="google-auth-form" method="post" action="${escapeHtml(action)}">
      <input type="hidden" name="callbackUrl" value="${escapeHtml(callbackUrl)}" />
    </form>
    <script>document.getElementById("google-auth-form").submit();</script>
    <noscript>
      <button form="google-auth-form" type="submit">Lanjutkan login</button>
    </noscript>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
