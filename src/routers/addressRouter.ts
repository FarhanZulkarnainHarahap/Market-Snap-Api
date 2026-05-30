import { Router } from "express";
import { createAddress, deleteAddress, getAddresses, updateAddress } from "../controllers/addressController.js";
import { authenticate } from "../middleware/authRole.js";
import { createAddressSchema, updateAddressSchema } from "../middleware/schemas.js";
import { validate } from "../middleware/validate.js";

export const addressRouter = Router();

addressRouter.get("/addresses", authenticate, getAddresses);
addressRouter.post("/addresses", authenticate, validate(createAddressSchema), createAddress);
addressRouter.patch("/addresses/:id", authenticate, validate(updateAddressSchema), updateAddress);
addressRouter.delete("/addresses/:id", authenticate, deleteAddress);
