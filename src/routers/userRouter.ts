import { Router } from "express";
import { createUser, deleteUser, getProfile, getUsers, updateProfile, updateUser } from "../controllers/userController.js";
import { authenticate, onlySuperAdmin } from "../middleware/authRole.js";
import { createUserSchema, updateUserSchema } from "../middleware/schemas.js";
import { validate } from "../middleware/validate.js";

export const userRouter = Router();

userRouter.get("/users/me", authenticate, getProfile);
userRouter.patch("/users/me", authenticate, validate(updateUserSchema), updateProfile);
userRouter.get("/admin/users", ...onlySuperAdmin, getUsers);
userRouter.post("/admin/users", ...onlySuperAdmin, validate(createUserSchema), createUser);
userRouter.patch("/admin/users/:id", ...onlySuperAdmin, validate(updateUserSchema), updateUser);
userRouter.delete("/admin/users/:id", ...onlySuperAdmin, deleteUser);
