import { skipCSRFCheck } from "@auth/core";
import { ExpressAuth } from "@auth/express";
import Google from "@auth/express/providers/google";
import { signToken } from "./auth.js";
import { prisma } from "./prisma.js";

const defaultApiOrigin = "https://apimarket-snap.vercel.app";
const defaultWebOrigin = "https://market-snap.vercel.app";

export const authJsPath = "/authjs";
export const googleOAuthEnabled = Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));

export const authJsHandler = ExpressAuth({
  callbacks: {
    async signIn({ profile, user }) {
      const email = cleanString(profile?.email ?? user.email).toLowerCase();
      if (!email) return googleCallbackUrl({ error: "Akun Google tidak memiliki email." });

      try {
        const name = cleanString(profile?.name ?? user.name) || email.split("@")[0] || "Market Snap User";
        const avatarUrl = cleanString(profile?.picture ?? user.image) || undefined;
        const emailVerified = profile?.email_verified !== false;
        const existing = await prisma.user.findUnique({ where: { email } });
        const marketUser = existing
          ? await prisma.user.update({
              where: { id: existing.id },
              data: {
                avatarUrl: existing.avatarUrl ?? avatarUrl,
                isActive: true,
                verifiedAt: existing.verifiedAt ?? (emailVerified ? new Date() : undefined)
              }
            })
          : await prisma.user.create({
              data: {
                avatarUrl,
                email,
                isActive: true,
                name,
                role: "USER",
                verifiedAt: emailVerified ? new Date() : undefined
              }
            });

        return googleCallbackUrl({ token: signToken({ sub: marketUser.id, role: marketUser.role }) });
      } catch (error) {
        return googleCallbackUrl({ error: error instanceof Error ? error.message : "Login Google gagal" });
      }
    },
    async redirect({ url }) {
      const web = webOrigin();
      const api = apiOrigin();
      if (url.startsWith(web) || url.startsWith(api)) return url;
      if (url.startsWith("/")) return `${api}${url}`;
      return web;
    }
  },
  pages: {
    error: `${webOrigin()}/auth/google/callback`
  },
  providers: googleOAuthEnabled
    ? [
        Google({
          authorization: {
            params: {
              prompt: "select_account"
            }
          },
          clientId: String(env("GOOGLE_CLIENT_ID")),
          clientSecret: String(env("GOOGLE_CLIENT_SECRET")),
          redirectProxyUrl: authJsBaseUrl()
        })
      ]
    : [],
  redirectProxyUrl: authJsBaseUrl(),
  secret: env("AUTH_SECRET") ?? env("JWT_SECRET"),
  skipCSRFCheck,
  trustHost: true
});

export function authJsGoogleSignInUrl(): string {
  return `${authJsBaseUrl()}/signin/google`;
}

export function webOrigin(): string {
  return normalizeOrigin(env("WEB_ORIGIN")?.split(",")[0] ?? defaultWebOrigin);
}

export function apiOrigin(): string {
  return normalizeOrigin(env("API_PUBLIC_URL") ?? authUrlOrigin() ?? defaultApiOrigin);
}

export function googleCallbackUrl(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${webOrigin()}/auth/google/callback?${query.toString()}`;
}

function authJsBaseUrl(): string {
  const configured =
    env("GOOGLE_REDIRECT_PROXY_URL") ??
    env("AUTH_REDIRECT_PROXY_URL") ??
    env("AUTH_URL") ??
    `${apiOrigin()}${authJsPath}`;
  return normalizeAuthJsUrl(configured);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

function normalizeAuthJsUrl(url: string): string {
  const clean = normalizeOrigin(url);
  return clean.endsWith(authJsPath) ? clean : `${clean}${authJsPath}`;
}

function authUrlOrigin(): string | undefined {
  const authUrl = env("AUTH_URL");
  if (!authUrl) return undefined;
  try {
    return new URL(authUrl).origin;
  } catch {
    return undefined;
  }
}

function env(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}
