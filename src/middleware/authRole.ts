import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../config/auth.js";
import { prisma } from "../config/prisma.js";
import { sessionToken } from "../config/session.js";
import type { User } from "../types/market.js";
import { handleControllerError, mapUser } from "../utils/controllerHelpers.js";

export type Role = User["role"];

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = sessionToken(req) ?? bearerToken(req.header("authorization"));
    const payload = token ? verifyToken(token) : null;
    const user = payload ? await prisma.user.findUnique({ where: { id: payload.sub } }) : null;
    if (!user) {
      res.status(401).json({ message: "Silakan login terlebih dahulu" });
      return;
    }
    req.user = mapUser(user);
    next();
  } catch (error) {
    handleControllerError(res, error);
  }
}

export function authorizeRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "User belum terautentikasi" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: "Role tidak memiliki akses" });
      return;
    }
    next();
  };
}

function bearerToken(authorization?: string): string | null {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export const onlyAdmin = [authenticate, authorizeRoles("admin", "super_admin", "store_admin")];
export const onlySuperAdmin = [authenticate, authorizeRoles("super_admin")];
export const onlyUser = [authenticate, authorizeRoles("user")];
