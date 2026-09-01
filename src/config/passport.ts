import passport from "passport";
import { Strategy as FacebookStrategy, type Profile as FacebookProfile } from "passport-facebook";
import { Strategy as GoogleStrategy, type Profile as GoogleProfile } from "passport-google-oauth20";
import type { User } from "../../prisma/generated/prisma/client.js";
import { prisma } from "./prisma.js";

const defaultApiOrigin = "https://api-node.market-snap.web.id";
const defaultWebOrigin = "https://market-snap.web.id";

export const googleOAuthEnabled = Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
export const facebookOAuthEnabled = Boolean(facebookAppId() && facebookAppSecret());
export const oauthPassport = new passport.Passport();

if (googleOAuthEnabled) {
  oauthPassport.use(new GoogleStrategy({
    callbackURL: googleCallbackUrl(),
    clientID: String(env("GOOGLE_CLIENT_ID")),
    clientSecret: String(env("GOOGLE_CLIENT_SECRET"))
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      done(null, await findOrCreateOAuthUser("google", profile) as unknown as Express.User);
    } catch (error) {
      done(error);
    }
  }));
}

if (facebookOAuthEnabled) {
  oauthPassport.use(new FacebookStrategy({
    callbackURL: facebookCallbackUrl(),
    clientID: String(facebookAppId()),
    clientSecret: String(facebookAppSecret()),
    profileFields: ["id", "displayName", "name", "emails", "photos"]
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      done(null, await findOrCreateOAuthUser("facebook", profile) as unknown as Express.User);
    } catch (error) {
      done(error);
    }
  }));
}

export function apiOrigin(): string {
  return normalizeOrigin(env("API_PUBLIC_URL") ?? env("API_URL") ?? defaultApiOrigin);
}

export function webOrigin(): string {
  return normalizeOrigin(env("WEB_ORIGIN")?.split(",")[0] ?? env("FRONTEND_URL") ?? env("CLIENT_URL") ?? defaultWebOrigin);
}

export function googleCallbackUrl(): string {
  return env("GOOGLE_CALLBACK_URL") ?? `${apiOrigin()}/api/auth/google/callback`;
}

export function facebookCallbackUrl(): string {
  return env("FACEBOOK_CALLBACK_URL") ?? `${apiOrigin()}/api/auth/facebook/callback`;
}

export type OAuthUserRepository = Pick<typeof prisma.user, "create" | "findFirst" | "update">;

export async function findOrCreateOAuthUser(
  provider: "facebook" | "google",
  profile: FacebookProfile | GoogleProfile,
  users: OAuthUserRepository = prisma.user
): Promise<User> {
  const email = profile.emails?.map((entry) => entry.value.trim().toLowerCase()).find(Boolean);
  if (!email) throw new OAuthLoginError(`Email ${provider === "google" ? "Google" : "Facebook"} tidak tersedia. Izinkan akses email lalu coba lagi.`);

  if (provider === "google") {
    const verified = (profile as GoogleProfile)._json?.email_verified;
    if (verified === false) throw new OAuthLoginError("Email Google belum terverifikasi.");
  }

  const existing = await users.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing && !existing.isActive) throw new OAuthLoginError("Akun Market Snap ini sedang dinonaktifkan.");
  const name = profile.displayName?.trim() || email.split("@")[0] || "Market Snap User";
  const avatarUrl = profile.photos?.map((photo) => photo.value.trim()).find(Boolean);

  if (existing) {
    return users.update({
      where: { id: existing.id },
      data: {
        authProvider: existing.passwordHash || existing.password ? existing.authProvider : provider,
        avatarUrl: existing.avatarUrl ?? avatarUrl,
        verifiedAt: existing.verifiedAt ?? new Date()
      }
    });
  }

  return users.create({
    data: {
      authProvider: provider,
      avatarUrl,
      email,
      isActive: true,
      name,
      role: "CUSTOMER",
      verifiedAt: new Date()
    }
  });
}

export class OAuthLoginError extends Error {
  override readonly name = "OAuthLoginError";
}

function facebookAppId(): string | undefined {
  return env("FACEBOOK_APP_ID") ?? env("AUTH_FACEBOOK_ID");
}

function facebookAppSecret(): string | undefined {
  return env("FACEBOOK_APP_SECRET") ?? env("AUTH_FACEBOOK_SECRET");
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

function env(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}
