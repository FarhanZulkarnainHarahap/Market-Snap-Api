import { Router } from "express";
import { facebookCallback, facebookLogin, googleCallback, googleLogin, login, me, register, uploadAvatar } from "../controllers/authController.js";
import { authenticate } from "../middleware/authRole.js";
import { loginSchema, registerSchema } from "../middleware/schemas.js";
import { uploadProfileImage } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";

export const authRouter = Router();

authRouter.post("/auth/register", validate(registerSchema), register);
authRouter.post("/auth/login", validate(loginSchema), login);
authRouter.get("/auth/google", googleLogin);
authRouter.get("/auth/google/callback", googleCallback);
authRouter.get("/auth/facebook", facebookLogin);
authRouter.get("/auth/facebook/callback", facebookCallback);
authRouter.get("/auth/me", authenticate, me);
authRouter.post("/auth/avatar", authenticate, uploadProfileImage.single("avatar"), uploadAvatar);
