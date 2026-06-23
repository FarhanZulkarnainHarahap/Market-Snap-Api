import { skipCSRFCheck } from "@auth/core";
import { ExpressAuth } from "@auth/express";
import Facebook from "@auth/express/providers/facebook";
import Google from "@auth/express/providers/google";
import { signToken } from "./auth.js";
import { prisma } from "./prisma.js";

const defaultApiOrigin = "https://apimarket-snap.vercel.app";
const defaultWebOrigin = "https://market-snap.vercel.app";

export const authJsPath = "/authjs";
export const googleOAuthEnabled = Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
export const facebookOAuthEnabled = Boolean(env("AUTH_FACEBOOK_ID") && env("AUTH_FACEBOOK_SECRET"));

export const authJsHandler = ExpressAuth({
  callbacks: {
    async signIn({ account, profile, user }) {
      const provider = account?.provider === "facebook" ? "facebook" : "google";
      const providerAccountId = cleanString(account?.providerAccountId ?? profile?.id ?? user.id);
      const email = cleanString(profile?.email ?? user.email).toLowerCase() || fallbackEmail(provider, providerAccountId);
      if (!email) return oauthCallbackUrl(provider, { error: "Akun OAuth tidak memiliki email." });

      try {
        const name = cleanString(profile?.name ?? user.name) || email.split("@")[0] || "Market Snap User";
        const avatarUrl = cleanString(profile?.picture ?? user.image) || undefined;
        const emailVerified = profile?.email_verified !== false;
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing && accountProvider(existing) !== provider) {
          return oauthCallbackUrl(provider, { error: providerConflictMessage(accountProvider(existing)) });
        }
        const marketUser = existing
          ? await prisma.user.update({
              where: { id: existing.id },
              data: {
                avatarUrl: existing.avatarUrl ?? avatarUrl,
                authProvider: provider,
                isActive: true,
                verifiedAt: existing.verifiedAt ?? (emailVerified ? new Date() : undefined)
              }
            })
          : await prisma.user.create({
              data: {
                avatarUrl,
                email,
                authProvider: provider,
                isActive: true,
                name,
                role: "USER",
                verifiedAt: emailVerified ? new Date() : undefined
              }
            });

        return oauthCallbackUrl(provider, { token: signToken({ sub: marketUser.id, role: marketUser.role }) });
      } catch (error) {
        return oauthCallbackUrl(provider, { error: error instanceof Error ? error.message : "Login OAuth gagal" });
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
  providers: [
    ...(googleOAuthEnabled
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
      : []),
    ...(facebookOAuthEnabled
      ? [
          Facebook({
            authorization: {
              params: {
                scope: "public_profile"
              }
            },
            clientId: String(env("AUTH_FACEBOOK_ID")),
            clientSecret: String(env("AUTH_FACEBOOK_SECRET")),
            redirectProxyUrl: authJsBaseUrl()
          })
        ]
      : [])
  ],
  redirectProxyUrl: authJsBaseUrl(),
  secret: env("AUTH_SECRET") ?? env("JWT_SECRET"),
  skipCSRFCheck,
  trustHost: true
});

export function authJsGoogleSignInUrl(): string {
  return authJsProviderSignInUrl("google");
}

export function authJsFacebookSignInUrl(): string {
  return authJsProviderSignInUrl("facebook");
}

export function webOrigin(): string {
  return normalizeOrigin(env("WEB_ORIGIN")?.split(",")[0] ?? defaultWebOrigin);
}

export function apiOrigin(): string {
  return normalizeOrigin(env("API_PUBLIC_URL") ?? authUrlOrigin() ?? defaultApiOrigin);
}

export function googleCallbackUrl(params: Record<string, string>): string {
  return oauthCallbackUrl("google", params);
}

export function facebookCallbackUrl(params: Record<string, string>): string {
  return oauthCallbackUrl("facebook", params);
}

export function oauthCallbackUrl(provider: "facebook" | "google", params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${webOrigin()}/auth/${provider}/callback?${query.toString()}`;
}

function authJsProviderSignInUrl(provider: "facebook" | "google"): string {
  return `${authJsBaseUrl()}/signin/${provider}`;
}

function authJsBaseUrl(): string {
  const configured =
    env("AUTH_REDIRECT_PROXY_URL") ??
    env("GOOGLE_REDIRECT_PROXY_URL") ??
    env("AUTH_URL") ??
    `${apiOrigin()}${authJsPath}`;
  return normalizeAuthJsUrl(configured);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fallbackEmail(provider: "facebook" | "google", providerAccountId: string): string {
  return provider === "facebook" && providerAccountId ? `facebook-${providerAccountId}@oauth.market-snap.local` : "";
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
