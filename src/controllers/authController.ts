import type { Request, Response } from "express";
import { cloudinary } from "../config/cloudinary.js";
import { hashPassword, signToken, verifyPassword, verifyToken } from "../config/auth.js";
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
import { resend } from "../config/resend.js";
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

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  try {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && (user.passwordHash || user.password)) {
      const token = signToken({ sub: user.id, role: "password_reset" });
      const resetUrl = `${webOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Market Snap <onboarding@resend.dev>",
        to: user.email,
        subject: "Ubah password Market Snap",
        html: passwordResetEmail(user.name, resetUrl)
      });
    }
    res.json({ message: "Jika email terdaftar, instruksi ubah password akan dikirim sebentar lagi." });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function confirmPasswordReset(req: Request, res: Response): Promise<void> {
  try {
    const token = verifyToken(String(req.body.token ?? ""));
    if (!token || token.role !== "password_reset") {
      res.status(400).json({ message: "Link ubah password sudah tidak berlaku." });
      return;
    }
    await prisma.user.update({
      where: { id: token.sub },
      data: { password: null, passwordHash: hashPassword(String(req.body.password)) }
    });
    res.json({ message: "Password berhasil diperbarui. Silakan masuk kembali." });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function uploadAvatar(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ message: "File avatar wajib diupload" });
      return;
    }
    const currentUser = await prisma.user.findUnique({ where: { id: String(req.user?.id) } });
    if (!currentUser || !(currentUser.passwordHash || currentUser.password)) {
      res.status(403).json({ message: "Foto profil akun ini dikelola oleh penyedia login." });
      return;
    }
    const uploaded = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
      { folder: "market-snap/avatars", overwrite: true, public_id: currentUser.id }
    );
    const user = await prisma.user.update({ where: { id: currentUser.id }, data: { avatarUrl: uploaded.secure_url } });
    res.json({ message: "Foto profil berhasil diperbarui.", data: mapUser(user) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

function passwordResetEmail(name: string, resetUrl: string): string {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);
  return `<!doctype html>
<html lang="id">
  <body style="margin:0;background:#f4f8f1;font-family:Arial,sans-serif;color:#083f22;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f8f1;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d9e5d8;border-radius:18px;padding:32px;">
            <tr><td style="font-size:24px;font-weight:800;letter-spacing:.02em;">MARKET SNAP</td></tr>
            <tr><td style="padding-top:28px;font-size:22px;font-weight:800;">Ubah password akun Anda</td></tr>
            <tr><td style="padding-top:12px;font-size:15px;line-height:1.7;color:#476152;">Halo ${safeName}, kami menerima permintaan untuk mengubah password akun Market Snap Anda. Klik tombol di bawah untuk membuat password baru.</td></tr>
            <tr><td style="padding-top:24px;"><a href="${safeUrl}" style="display:inline-block;background:#07582c;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 22px;font-weight:800;">Ubah password</a></td></tr>
            <tr><td style="padding-top:24px;font-size:13px;line-height:1.6;color:#6d7d70;">Link ini berlaku selama 24 jam. Abaikan email ini jika Anda tidak meminta perubahan password.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
