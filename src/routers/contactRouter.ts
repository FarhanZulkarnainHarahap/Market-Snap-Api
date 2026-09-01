import { Router } from "express";
import { createContactMessage } from "../controllers/contactController.js";
import { contactMessageSchema } from "../middleware/schemas.js";
import { validate } from "../middleware/validate.js";

export const contactRouter = Router();
contactRouter.post("/contact", validate(contactMessageSchema), createContactMessage);
