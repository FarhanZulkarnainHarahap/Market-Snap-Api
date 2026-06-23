import type { User as MarketUser } from "./market.js";

declare global {
  namespace Express {
    interface User extends MarketUser {}

    interface Request {
      user?: User;
    }
  }
}

export {};
