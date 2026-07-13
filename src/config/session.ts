import type { CookieOptions, Request, Response } from "express";

export const sessionCookieName = "market_snap_session";
const dayMs = 24 * 60 * 60 * 1000;

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(sessionCookieName, token, sessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(sessionCookieName, sessionCookieOptions());
}

export function sessionToken(req: Request): string | null {
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === sessionCookieName) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

function sessionCookieOptions(): CookieOptions {
  const secure = isHttps();
  return {
    httpOnly: true,
    maxAge: dayMs,
    path: "/",
    sameSite: "lax",
    secure
  };
}

function isHttps(): boolean {
  return process.env.NODE_ENV === "production" || process.env.AUTH_URL?.startsWith("https://") || process.env.API_PUBLIC_URL?.startsWith("https://") || false;
}
