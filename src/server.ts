import cors from "cors";
import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routers/index.js";

export const app = express();

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

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "1mb" }));
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "Market Snap API",
    health: "/health"
  });
});
app.use(apiRouter);
app.use(errorHandler);

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}
