import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { logger } from "../config/logger.js";
import { publicErrorMessage } from "../utils/controllerHelpers.js";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ success: false, message: err.message, code: "UPLOAD_ERROR" });
    return;
  }
  logger.error({ err, path: req.path, method: req.method }, "HTTP_ERROR");
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  res.status(500).json({ success: false, message: publicErrorMessage(err), code: "INTERNAL_SERVER_ERROR" });
}
