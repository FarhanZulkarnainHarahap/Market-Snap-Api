import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import * as Sentry from "@sentry/node";
import { authJsHandler } from "./config/authjs.js";
import { logger } from "./config/logger.js";
import { xenditConfig } from "./config/xendit.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routers/index.js";

export const app = express();
app.set("trust proxy", true);

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
  "http://localhost:3000",
  "http://localhost:3100",
  "http://localhost:3200",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3100",
  "http://127.0.0.1:3200"
].filter(Boolean) as string[];

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(pinoHttp({ logger }));
app.use(cors({ credentials: true, origin: allowedOrigins }));
app.use(/^\/authjs\/(.*)/, authJsHandler);
app.use(express.json({ limit: "1mb" }));
app.use(["/auth/login", "/auth/register", "/auth/password-reset/request"], rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
app.use(["/orders", "/payments", "/cart"], rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: true, legacyHeaders: false }));
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "Market Snap API",
    health: "/health"
  });
});
app.use("/", apiRouter);
app.use(errorHandler);

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}
