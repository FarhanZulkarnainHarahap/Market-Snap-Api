import { Router } from "express";
import { databaseHealth, health } from "../controllers/healthController.js";

export const healthRouter = Router();

healthRouter.get("/health", health);
healthRouter.get("/health/db", databaseHealth);
