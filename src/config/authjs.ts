import { skipCSRFCheck } from "@auth/core";
import { ExpressAuth } from "@auth/express";
import Google from "@auth/express/providers/google";
import { signToken } from "./auth.js";
import { prisma } from "./prisma.js";

const defaultApiOrigin = "https://apimarket-snap.vercel.app";
const defaultWebOrigin = "https://market-snap.vercel.app";

export const authJsPath = "/authjs";
export const googleOAuthEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

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
    error: `${defaultWebOrigin}/auth/google/callback`
  },
  providers: googleOAuthEnabled
    ? [
        Google({
          authorization: {
            params: {
              prompt: "select_account"
            }
          },
          clientId: String(process.env.GOOGLE_CLIENT_ID),
          clientSecret: String(process.env.GOOGLE_CLIENT_SECRET)
        })
      ]
    : [],
  secret: process.env.AUTH_SECRET ?? process.env.JWT_SECRET,
  skipCSRFCheck,
  trustHost: true
});

export function authJsGoogleSignInUrl(): string {
  return `${apiOrigin()}${authJsPath}/signin/google`;
}

export function webOrigin(): string {
  return normalizeOrigin(process.env.WEB_ORIGIN?.split(",")[0] ?? defaultWebOrigin);
}

export function apiOrigin(): string {
  return normalizeOrigin(process.env.API_PUBLIC_URL ?? process.env.AUTH_URL?.replace(/\/authjs\/?$/, "") ?? defaultApiOrigin);
}

export function googleCallbackUrl(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${webOrigin()}/auth/google/callback?${query.toString()}`;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}
