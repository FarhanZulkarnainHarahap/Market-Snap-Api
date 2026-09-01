import multer from "multer";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";

const allowedImageTypes = ["image/jpeg", "image/png", "image/gif"];
const allowedPaymentTypes = ["image/jpeg", "image/png"];
const allowedImageExt = [".jpg", ".jpeg", ".png", ".gif"];
const allowedPaymentExt = [".jpg", ".jpeg", ".png"];
const maxImageSize = 1 * 1024 * 1024;

function imageFilter(allowedTypes: string[], allowedExt: string[]): multer.Options["fileFilter"] {
  return (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedTypes.includes(file.mimetype) || !allowedExt.includes(ext)) {
      callback(new Error("Format file tidak valid"));
      return;
    }
    callback(null, true);
  };
}

export const uploadProfileImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxImageSize },
  fileFilter: imageFilter(allowedImageTypes, allowedImageExt)
});

export const uploadPaymentProof = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxImageSize },
  fileFilter: imageFilter(allowedPaymentTypes, allowedPaymentExt)
});

export const uploadProductImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxImageSize, files: 5 },
  fileFilter: imageFilter(allowedImageTypes, allowedImageExt)
});

export function validateUploadedImageBytes(req: Request, res: Response, next: NextFunction): void {
  const files = [req.file, ...(Array.isArray(req.files) ? req.files : [])].filter((file): file is Express.Multer.File => Boolean(file));
  if (files.some((file) => !matchesImageSignature(file.buffer, file.mimetype))) {
    res.status(400).json({ message: "Isi file tidak sesuai dengan format gambar yang diizinkan.", code: "INVALID_FILE_SIGNATURE" });
    return;
  }
  next();
}

export function matchesImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/gif") return buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  return false;
}
