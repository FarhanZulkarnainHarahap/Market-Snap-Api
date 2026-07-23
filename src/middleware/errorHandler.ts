import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { publicErrorMessage } from "../utils/controllerHelpers.js";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ message: err.message });
    return;
  }
  if (process.env.NODE_ENV !== "production") console.error(err.message);
  res.status(500).json({ message: publicErrorMessage(err) });
}
