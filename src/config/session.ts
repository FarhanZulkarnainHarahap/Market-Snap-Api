import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import { signToken } from "./auth.js";
import { prisma } from "./prisma.js";

export const sessionCookieName = "market_snap_session";
export const refreshCookieName = "market_snap_refresh";

const accessTokenMaxAgeMs = 15 * 60 * 1000;
const refreshTokenMaxAgeMs = 30 * 24 * 60 * 60 * 1000;

type SessionUser = { id: string; role: string };

export async function createSession(res: Response, user: SessionUser): Promise<void> {
  const refreshToken = randomBytes(48).toString("base64url");
  await prisma.refreshSession.create({
    data: {
      expiresAt: new Date(Date.now() + refreshTokenMaxAgeMs),
      tokenHash: refreshTokenHash(refreshToken),
      userId: user.id
    }
  });
  setSessionCookies(res, signToken({ sub: user.id, role: user.role }), refreshToken);
}

export async function rotateSession(req: Request, res: Response): Promise<SessionUser | null> {
  const refreshToken = cookieValue(req, refreshCookieName);
  if (!refreshToken) return null;
  const tokenHash = refreshTokenHash(refreshToken);
  const replacementToken = randomBytes(48).toString("base64url");
  const replacementHash = refreshTokenHash(replacementToken);
  const now = new Date();

  const user = await prisma.$transaction(async (tx) => {
    const current = await tx.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, isActive: true, role: true } } }
    });
    if (!current || current.revokedAt || current.expiresAt <= now || !current.user.isActive) return null;
    const revoked = await tx.refreshSession.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: now }
    });
    if (revoked.count !== 1) return null;
    await tx.refreshSession.create({
      data: {
        expiresAt: new Date(Date.now() + refreshTokenMaxAgeMs),
        tokenHash: replacementHash,
        userId: current.user.id
      }
    });
    return { id: current.user.id, role: current.user.role };
  });

  if (!user) return null;
  setSessionCookies(res, signToken({ sub: user.id, role: user.role }), replacementToken);
  return user;
}

export async function revokeSession(req: Request): Promise<void> {
  const refreshToken = cookieValue(req, refreshCookieName);
  if (!refreshToken) return;
  await prisma.refreshSession.updateMany({
    where: { tokenHash: refreshTokenHash(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(sessionCookieName, cookieOptions());
  res.clearCookie(refreshCookieName, cookieOptions());
}

export function sessionToken(req: Request): string | null {
  return cookieValue(req, sessionCookieName);
}

function setSessionCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(sessionCookieName, accessToken, { ...cookieOptions(), maxAge: accessTokenMaxAgeMs });
  res.cookie(refreshCookieName, refreshToken, { ...cookieOptions(), maxAge: refreshTokenMaxAgeMs });
}

function cookieValue(req: Request, name: string): string | null {
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

function cookieOptions(): CookieOptions {
  const secure = isHttps();
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure
  };
}

function isHttps(): boolean {
  return process.env.NODE_ENV === "production" ||
    process.env.AUTH_URL?.startsWith("https://") ||
    process.env.API_PUBLIC_URL?.startsWith("https://") ||
    process.env.API_URL?.startsWith("https://") ||
    false;
}

function refreshTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
