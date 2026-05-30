import { Router } from "express";
import { createProduct, deleteProduct, updateProduct } from "../controllers/productController.js";
import { onlySuperAdmin } from "../middleware/authRole.js";
import { createProductSchema, updateProductSchema } from "../middleware/schemas.js";
import { uploadProductImages } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";

export const productRouter = Router();

productRouter.post("/admin/products", ...onlySuperAdmin, uploadProductImages.array("images", 5), validate(createProductSchema), createProduct);
productRouter.patch("/admin/products/:id", ...onlySuperAdmin, validate(updateProductSchema), updateProduct);
productRouter.delete("/admin/products/:id", ...onlySuperAdmin, deleteProduct);
