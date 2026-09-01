import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { cloudinary } from "../config/cloudinary.js";
import { hashPassword, passwordNeedsRehash, signPurposeToken, verifyPassword, verifyToken } from "../config/auth.js";
import {
  facebookOAuthEnabled,
  googleOAuthEnabled,
  OAuthLoginError,
  oauthPassport,
  webOrigin
} from "../config/passport.js";
import { prisma } from "../config/prisma.js";
import { resend } from "../config/resend.js";
import { clearSessionCookies, createSession, revokeSession, rotateSession } from "../config/session.js";
import { handleControllerError, mapUser } from "../utils/controllerHelpers.js";

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const exists = await prisma.user.findFirst({ where: { email: { equals: req.body.email, mode: "insensitive" } } });
    if (exists) {
      res.status(409).json({ message: providerConflictMessage(accountProvider(exists)) });
      return;
    }
    const referralCode = cleanOptional(req.body.referralCode);
    const user = await prisma.user.create({
      data: {
        name: req.body.name,
        email: req.body.email,
        passwordHash: await hashPassword(req.body.password),
        authProvider: "credentials",
        referralCode,
        role: "CUSTOMER",
        isActive: true
      }
    });
    res.status(201).json({ data: mapUser(user), verificationExpiresInMinutes: 60 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      res.status(409).json({ message: "Email sudah terdaftar." });
      return;
    }
    handleControllerError(res, error);
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: req.body.email, mode: "insensitive" } } });
    if (!user) {
      res.status(401).json({ message: "Email atau password salah" });
      return;
    }
    if (!user.isActive) {
      res.status(403).json({ message: "Akun sedang dinonaktifkan." });
      return;
    }
    const provider = accountProvider(user);
    if (provider !== "credentials") {
      res.status(409).json({ message: providerConflictMessage(provider) });
      return;
    }
    const storedPassword = user.passwordHash ?? user.password;
    if (!await verifyPassword(req.body.password, storedPassword)) {
      res.status(401).json({ message: "Email atau password salah" });
      return;
    }
    if (passwordNeedsRehash(storedPassword)) {
      await prisma.user.update({ where: { id: user.id }, data: { password: null, passwordHash: await hashPassword(req.body.password) } });
    }
    await createSession(res, user);
    res.json({ token: "", user: mapUser(user) });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  await revokeSession(req).catch(() => undefined);
  clearSessionCookies(res);
  res.json({ message: "Logout berhasil." });
}

export async function refreshSession(req: Request, res: Response): Promise<void> {
  try {
    const user = await rotateSession(req, res);
    if (!user) {
      clearSessionCookies(res);
      res.status(401).json({ message: "Sesi login sudah berakhir. Silakan login kembali." });
      return;
    }
    res.json({ message: "Sesi berhasil diperbarui." });
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

export function googleLogin(req: Request, res: Response, next: NextFunction): void {
  if (!googleOAuthEnabled) {
    res.status(503).json({ message: "Google OAuth belum dikonfigurasi" });
    return;
  }
  beginOAuth("google", req, res, next);
}

export function googleCallback(req: Request, res: Response, next: NextFunction): void {
  completeOAuth("google", req, res, next);
}

export function facebookLogin(req: Request, res: Response, next: NextFunction): void {
  if (!facebookOAuthEnabled) {
    res.status(503).json({ message: "Facebook OAuth belum dikonfigurasi" });
    return;
  }
  beginOAuth("facebook", req, res, next);
}

export function facebookCallback(req: Request, res: Response, next: NextFunction): void {
  completeOAuth("facebook", req, res, next);
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
      const token = signPurposeToken({ sub: user.id, role: "password_reset" });
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
    if (!token || token.type !== "purpose" || token.role !== "password_reset") {
      res.status(400).json({ message: "Link ubah password sudah tidak berlaku." });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: token.sub },
        data: { password: null, passwordHash: await hashPassword(String(req.body.password)) }
      });
      await tx.refreshSession.updateMany({
        where: { userId: token.sub, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    });
    res.json({ message: "Password berhasil diperbarui. Silakan masuk kembali." });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function requestEmailVerification(req: Request, res: Response): Promise<void> {
  try {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { id: String(req.user?.id) } });
    if (!user) {
      res.status(404).json({ message: "Akun tidak ditemukan" });
      return;
    }
    if (user.verifiedAt) {
      res.json({ message: "Akun Anda sudah terverifikasi." });
      return;
    }
    if (email !== user.email.toLowerCase()) {
      res.status(422).json({ message: "Email tidak sesuai dengan akun aktif." });
      return;
    }
    const token = signPurposeToken({ sub: user.id, role: "email_verify" });
    const verifyUrl = `${webOrigin()}/verify-email?token=${encodeURIComponent(token)}`;
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Market Snap <onboarding@resend.dev>",
      to: user.email,
      subject: "Verifikasi akun Market Snap",
      html: emailVerificationEmail(user.name, verifyUrl)
    });
    res.json({ message: "Link verifikasi sudah dikirim ke email Anda." });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function confirmEmailVerification(req: Request, res: Response): Promise<void> {
  try {
    const token = verifyToken(String(req.body.token ?? ""));
    if (!token || token.type !== "purpose" || token.role !== "email_verify") {
      res.status(400).json({ message: "Link verifikasi sudah tidak berlaku." });
      return;
    }
    const user = await prisma.user.update({ where: { id: token.sub }, data: { verifiedAt: new Date() } });
    res.json({ message: "Akun berhasil diverifikasi.", data: mapUser(user) });
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
            <tr><td style="padding-top:24px;font-size:13px;line-height:1.6;color:#6d7d70;">Link ini berlaku selama 1 jam. Abaikan email ini jika Anda tidak meminta perubahan password.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function emailVerificationEmail(name: string, verifyUrl: string): string {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verifyUrl);
  return `<!doctype html>
<html lang="id">
  <body style="margin:0;background:#f4f8f1;font-family:Arial,sans-serif;color:#083f22;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f8f1;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d9e5d8;border-radius:18px;padding:32px;">
            <tr><td style="font-size:24px;font-weight:800;letter-spacing:.02em;">MARKET SNAP</td></tr>
            <tr><td style="padding-top:28px;font-size:22px;font-weight:800;">Verifikasi akun Anda</td></tr>
            <tr><td style="padding-top:12px;font-size:15px;line-height:1.7;color:#476152;">Halo ${safeName}, verifikasi akun Market Snap Anda untuk mulai menambahkan produk ke keranjang dan berbelanja lebih cepat.</td></tr>
            <tr><td style="padding-top:24px;"><a href="${safeUrl}" style="display:inline-block;background:#07582c;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 22px;font-weight:800;">Verifikasi sekarang</a></td></tr>
            <tr><td style="padding-top:24px;font-size:13px;line-height:1.6;color:#6d7d70;">Abaikan email ini jika Anda tidak meminta verifikasi akun.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function accountProvider(user: { authProvider?: string | null; password?: string | null; passwordHash?: string | null }): "credentials" | "facebook" | "google" {
  if (user.passwordHash || user.password) return "credentials";
  const provider = String(user.authProvider ?? "").toLowerCase();
  return provider === "facebook" ? "facebook" : provider === "google" ? "google" : "credentials";
}

function providerConflictMessage(provider: "credentials" | "facebook" | "google"): string {
  if (provider === "google") return "Email ini sudah terhubung dengan Google. Silakan masuk dengan Google.";
  if (provider === "facebook") return "Email ini sudah terhubung dengan Facebook. Silakan masuk dengan Facebook.";
  return "Email ini sudah terdaftar. Silakan masuk dengan email dan password.";
}

function beginOAuth(provider: "facebook" | "google", req: Request, res: Response, next: NextFunction): void {
  const state = randomBytes(32).toString("base64url");
  res.cookie(oauthStateCookieName(provider), state, { ...oauthStateCookieOptions(), maxAge: 10 * 60 * 1000 });
  const options = provider === "google"
    ? { prompt: "select_account", scope: ["openid", "email", "profile"], session: false, state }
    : { authType: "rerequest", scope: ["email", "public_profile"], session: false, state };
  oauthPassport.authenticate(provider, options)(req, res, next);
}

function completeOAuth(provider: "facebook" | "google", req: Request, res: Response, next: NextFunction): void {
  const expectedState = readCookie(req, oauthStateCookieName(provider));
  const receivedState = typeof req.query.state === "string" ? req.query.state : "";
  res.clearCookie(oauthStateCookieName(provider), oauthStateCookieOptions());

  if (!expectedState || !receivedState || !secureStringEquals(expectedState, receivedState)) {
    redirectOAuthResult(res, provider, { error: "Permintaan OAuth tidak valid atau sudah kedaluwarsa." });
    return;
  }

  oauthPassport.authenticate(provider, { session: false }, async (error: unknown, user: Express.User | false | null, info: { message?: string } | undefined) => {
    if (error || !user) {
      const message = error instanceof OAuthLoginError
        ? error.message
        : req.query.error === "access_denied"
          ? `Login ${provider === "google" ? "Google" : "Facebook"} dibatalkan.`
          : info?.message || `Login ${provider === "google" ? "Google" : "Facebook"} gagal. Silakan coba lagi.`;
      redirectOAuthResult(res, provider, { error: message });
      return;
    }
    try {
      await createSession(res, { id: user.id, role: user.role });
      redirectOAuthResult(res, provider, { success: "1" });
    } catch (sessionError) {
      next(sessionError);
    }
  })(req, res, next);
}

function redirectOAuthResult(res: Response, provider: "facebook" | "google", params: Record<string, string>): void {
  const query = new URLSearchParams({ provider, ...params });
  res.redirect(`${webOrigin()}/auth/callback?${query.toString()}`);
}

function oauthStateCookieName(provider: "facebook" | "google"): string {
  return `market_snap_oauth_state_${provider}`;
}

function oauthStateCookieOptions() {
  const secure = process.env.NODE_ENV === "production" || process.env.API_PUBLIC_URL?.startsWith("https://") || false;
  return { httpOnly: true, path: "/", sameSite: "lax" as const, secure };
}

function readCookie(req: Request, name: string): string {
  for (const cookie of req.headers.cookie?.split(";") ?? []) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return "";
}

function secureStringEquals(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
