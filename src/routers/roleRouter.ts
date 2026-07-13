import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { createDiscount, createStore, getDiscounts, getSalesReport, getStores } from "../controllers/adminController.js";
import { getCategories, getProducts } from "../controllers/catalogController.js";
import { getOrders } from "../controllers/orderController.js";
import { createProduct } from "../controllers/productController.js";
import { createUser, getUsers } from "../controllers/userController.js";
import { authenticate, onlyAdmin, onlySuperAdmin } from "../middleware/authRole.js";
import { createDiscountSchema, createProductSchema, createStoreSchema, createUserSchema } from "../middleware/schemas.js";
import { uploadProductImages } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";

export const roleRouter = Router();

roleRouter.get("/super-admin/stores", ...onlySuperAdmin, getStores);
roleRouter.post("/super-admin/stores", ...onlySuperAdmin, validate(createStoreSchema), createStore);
roleRouter.get("/super-admin/products", ...onlySuperAdmin, getProducts);
roleRouter.post("/super-admin/products", ...onlySuperAdmin, uploadProductImages.array("images", 5), validate(createProductSchema), createProduct);
roleRouter.get("/super-admin/categories", ...onlySuperAdmin, getCategories);
roleRouter.get("/super-admin/users", ...onlySuperAdmin, getUsers);
roleRouter.get("/super-admin/store-admins", ...onlySuperAdmin, getUsers);
roleRouter.post("/super-admin/store-admins", ...onlySuperAdmin, validate(createUserSchema), createUser);
roleRouter.get("/super-admin/inventory", ...onlySuperAdmin, getProducts);
roleRouter.get("/super-admin/discounts", ...onlySuperAdmin, getDiscounts);
roleRouter.post("/super-admin/discounts", ...onlySuperAdmin, validate(createDiscountSchema), createDiscount);
roleRouter.get("/super-admin/orders", ...onlySuperAdmin, getOrders);
roleRouter.get("/super-admin/reports", ...onlySuperAdmin, getSalesReport);

roleRouter.get("/store-admin/products", authenticate, requireStoreAdmin, getProducts);
roleRouter.get("/store-admin/categories", authenticate, requireStoreAdmin, getCategories);
roleRouter.get("/store-admin/inventory", ...onlyAdmin, getProducts);
roleRouter.get("/store-admin/discounts", ...onlyAdmin, getDiscounts);
roleRouter.post("/store-admin/discounts", ...onlyAdmin, validate(createDiscountSchema), createDiscount);
roleRouter.get("/store-admin/orders", ...onlyAdmin, getOrders);
roleRouter.get("/store-admin/reports", ...onlyAdmin, getSalesReport);

function requireStoreAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "store_admin") {
    res.status(403).json({ message: "Store Admin only" });
    return;
  }
  next();
}
