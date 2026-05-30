import type { User } from "./market.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
