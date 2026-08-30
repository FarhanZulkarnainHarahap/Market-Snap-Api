import cors from "cors";
import { randomBytes } from "node:crypto";
import express from "express";
import type { Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import * as Sentry from "@sentry/node";
import { logger } from "./config/logger.js";
import { oauthPassport } from "./config/passport.js";
import { xenditConfig } from "./config/xendit.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routers/index.js";

export const app = express();
app.set("trust proxy", Math.max(1, Number(process.env.TRUST_PROXY_HOPS ?? 1)));

if (!xenditConfig.isReady) {
  logger[process.env.NODE_ENV === "production" ? "error" : "warn"]({
    event: "XENDIT_DISABLED",
    callbackTokenConfigured: xenditConfig.callbackTokenConfigured,
    secretKeyConfigured: xenditConfig.hasSecretKey
  }, "Checkout Xendit dinonaktifkan sampai konfigurasi pembayaran lengkap.");
}

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV ?? "development" });
}

const webOrigins = (process.env.WEB_ORIGIN ?? "").split(",").map(normalizeOrigin).filter(Boolean);

const allowedOrigins = [
  ...webOrigins,
  "https://market-snap.web.id",
  "http://localhost:3000",
  "http://localhost:3100",
  "http://localhost:3200",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3100",
  "http://127.0.0.1:3200"
].filter(Boolean) as string[];

app.use((_req, res, next) => {
  res.locals.cspNonce = randomBytes(32).toString("base64");
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`]
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(pinoHttp({ logger }));
app.use(cors({ credentials: true, origin: allowedOrigins }));
app.use((req, res, next) => {
  const origin = req.header("origin");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && origin && !allowedOrigins.includes(normalizeOrigin(origin))) {
    res.status(403).json({ message: "Origin request tidak diizinkan." });
    return;
  }
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(oauthPassport.initialize());
app.use(/^\/(?:api\/)?auth\/login$/, rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}::${String(req.body?.email ?? "").trim().toLowerCase()}`,
  message: { message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." },
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(/^\/(?:api\/)?auth\/(?:register|password-reset\/request)$/, rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Terlalu banyak permintaan. Coba lagi dalam 15 menit." },
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(/^\/(?:api\/)?auth\/(?:google|facebook)/, rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
app.use(/^\/(?:api\/)?auth\/refresh$/, rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use(/^\/(?:api\/)?(?:orders|payments|payment|cart)/, rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: true, legacyHeaders: false }));
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "Market Snap API",
    health: "/health"
  });
});
app.use("/", apiRouter);
app.use("/api", apiRouter);
app.use(errorHandler);

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}
