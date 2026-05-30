import { Router } from "express";
import { addressRouter } from "./addressRouter.js";
import { adminRouter } from "./adminRouter.js";
import { authRouter } from "./authRouter.js";
import { cartRouter } from "./cartRouter.js";
import { catalogRouter } from "./catalogRouter.js";
import { healthRouter } from "./healthRouter.js";
import { orderRouter } from "./orderRouter.js";
import { productRouter } from "./productRouter.js";
import { userRouter } from "./userRouter.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(catalogRouter);
apiRouter.use(authRouter);
apiRouter.use(userRouter);
apiRouter.use(addressRouter);
apiRouter.use(cartRouter);
apiRouter.use(orderRouter);
apiRouter.use(productRouter);
apiRouter.use(adminRouter);
