import multer from "multer";
import type { NextFunction, Request, Response } from "express";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ message: err.message });
    return;
  }
  res.status(500).json({ message: err.message || "Server error" });
}
