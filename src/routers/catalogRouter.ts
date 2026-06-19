import { Router } from "express";
import { getCategories, getNearestStore, getProductDetail, getProducts, getStores, getVouchers } from "../controllers/catalogController.js";

export const catalogRouter = Router();

catalogRouter.get("/stores/nearest", getNearestStore);
catalogRouter.get("/stores", getStores);
catalogRouter.get("/categories", getCategories);
catalogRouter.get("/vouchers", getVouchers);
catalogRouter.get("/products", getProducts);
catalogRouter.get("/products/:id", getProductDetail);
