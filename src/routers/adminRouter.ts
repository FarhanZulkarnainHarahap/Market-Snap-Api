import { Router } from "express";
import { createDiscount, createStore, getDiscounts, getSalesReport, getStores } from "../controllers/adminController.js";
import { onlyAdmin, onlySuperAdmin } from "../middleware/authRole.js";
import { createDiscountSchema, createStoreSchema } from "../middleware/schemas.js";
import { validate } from "../middleware/validate.js";

export const adminRouter = Router();

adminRouter.get("/admin/stores", ...onlySuperAdmin, getStores);
adminRouter.post("/admin/stores", ...onlySuperAdmin, validate(createStoreSchema), createStore);
adminRouter.get("/admin/discounts", ...onlyAdmin, getDiscounts);
adminRouter.post("/admin/discounts", ...onlyAdmin, validate(createDiscountSchema), createDiscount);
adminRouter.get("/admin/reports/sales", ...onlyAdmin, getSalesReport);
