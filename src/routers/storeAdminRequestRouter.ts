import { Router } from "express";
import { approveStoreAdminRequest, cancelMyStoreAdminRequest, createStoreAdminRequest, getMyStoreAdminRequest, getStoreAdminRequestById, listStoreAdminRequests, rejectStoreAdminRequest } from "../controllers/storeAdminRequestController.js";
import { onlyCustomer, onlySuperAdmin } from "../middleware/authRole.js";
import { approveStoreAdminRequestSchema, createStoreAdminRequestSchema, rejectStoreAdminRequestSchema } from "../middleware/schemas.js";
import { validate } from "../middleware/validate.js";

export const storeAdminRequestRouter = Router();

storeAdminRequestRouter.get("/store-admin-requests/me", ...onlyCustomer, getMyStoreAdminRequest);
storeAdminRequestRouter.post("/store-admin-requests", ...onlyCustomer, validate(createStoreAdminRequestSchema), createStoreAdminRequest);
storeAdminRequestRouter.patch("/store-admin-requests/me/cancel", ...onlyCustomer, cancelMyStoreAdminRequest);

storeAdminRequestRouter.get("/admin/store-admin-requests", ...onlySuperAdmin, listStoreAdminRequests);
storeAdminRequestRouter.get("/admin/store-admin-requests/:id", ...onlySuperAdmin, getStoreAdminRequestById);
storeAdminRequestRouter.patch("/admin/store-admin-requests/:id/approve", ...onlySuperAdmin, validate(approveStoreAdminRequestSchema), approveStoreAdminRequest);
storeAdminRequestRouter.patch("/admin/store-admin-requests/:id/reject", ...onlySuperAdmin, validate(rejectStoreAdminRequestSchema), rejectStoreAdminRequest);
