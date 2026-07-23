import { Router } from "express";
import { addCartItem, clearCart, deleteCartItem, deleteSelectedCartItems, getCart, updateCartItem, validateCartVoucher } from "../controllers/cartController.js";
import { onlyUser } from "../middleware/authRole.js";
import { addCartItemSchema, updateCartItemSchema, validateVoucherSchema } from "../middleware/schemas.js";
import { validate } from "../middleware/validate.js";

export const cartRouter = Router();

cartRouter.get("/cart", ...onlyUser, getCart);
cartRouter.post("/cart", ...onlyUser, validate(addCartItemSchema), addCartItem);
cartRouter.post("/cart/items", ...onlyUser, validate(addCartItemSchema), addCartItem);
cartRouter.patch("/cart/:id", ...onlyUser, validate(updateCartItemSchema), updateCartItem);
cartRouter.patch("/cart/items/:id", ...onlyUser, validate(updateCartItemSchema), updateCartItem);
cartRouter.post("/cart/voucher/validate", ...onlyUser, validate(validateVoucherSchema), validateCartVoucher);
cartRouter.post("/cart/items/delete-selected", ...onlyUser, deleteSelectedCartItems);
cartRouter.delete("/cart/:id", ...onlyUser, deleteCartItem);
cartRouter.delete("/cart/items/:id", ...onlyUser, deleteCartItem);
cartRouter.delete("/cart", ...onlyUser, clearCart);
cartRouter.post("/cart/validate", ...onlyUser, getCart);
