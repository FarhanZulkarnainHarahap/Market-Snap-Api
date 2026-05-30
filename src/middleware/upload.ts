import multer from "multer";
import path from "node:path";

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
