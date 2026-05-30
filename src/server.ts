import cors from "cors";
import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routers/index.js";

export const app = express();

const allowedOrigins = [
  process.env.WEB_ORIGIN,
  "http://localhost:3000",
  "http://localhost:3100",
  "http://localhost:3200",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3100",
  "http://127.0.0.1:3200"
].filter(Boolean) as string[];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", apiRouter);
app.use(errorHandler);
