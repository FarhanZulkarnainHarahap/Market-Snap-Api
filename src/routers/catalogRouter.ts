import { Router } from "express";
import { getCategories, getNearestStore, getProductDetail, getProducts } from "../controllers/catalogController.js";

export const catalogRouter = Router();

catalogRouter.get("/stores/nearest", getNearestStore);
catalogRouter.get("/categories", getCategories);
catalogRouter.get("/products", getProducts);
catalogRouter.get("/products/:id", getProductDetail);
