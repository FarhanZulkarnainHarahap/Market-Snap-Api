import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "./prisma.js";
import { mapUser } from "../utils/controllerHelpers.js";

const defaultApiOrigin = process.env.API_PUBLIC_URL ?? "https://apimarket-snap.vercel.app";

export const googleOAuthEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (googleOAuthEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        callbackURL: process.env.GOOGLE_CALLBACK_URL ?? `${defaultApiOrigin.replace(/\/+$/, "")}/auth/google/callback`,
        clientID: String(process.env.GOOGLE_CLIENT_ID),
        clientSecret: String(process.env.GOOGLE_CLIENT_SECRET)
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(new Error("Akun Google tidak memiliki email."));

          const name = profile.displayName || email.split("@")[0] || "Market Snap User";
          const avatarUrl = profile.photos?.[0]?.value;
          const existing = await prisma.user.findUnique({ where: { email } });
          const user = existing
            ? await prisma.user.update({
                where: { id: existing.id },
                data: {
                  avatarUrl: existing.avatarUrl ?? avatarUrl,
                  isActive: true,
                  verifiedAt: existing.verifiedAt ?? new Date()
                }
              })
            : await prisma.user.create({
                data: {
                  avatarUrl,
                  email,
                  isActive: true,
                  name,
                  role: "USER",
                  verifiedAt: new Date()
                }
              });

          done(null, mapUser(user));
        } catch (error) {
          done(error);
        }
      }
    )
  );
}

export { passport };
