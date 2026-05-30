import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";

export function health(_req: Request, res: Response): void {
  try {
    res.json({ ok: true, name: "Market Snap API" });
  } catch {
    res.status(500).json({ message: "Health check gagal" });
  }
}

export async function databaseHealth(_req: Request, res: Response): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, database: "connected" });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Database tidak terkoneksi" });
  }
}
