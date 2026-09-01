import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { handleControllerError } from "../utils/controllerHelpers.js";

export async function createContactMessage(req: Request, res: Response): Promise<void> {
  try {
    if (req.body.website) {
      res.status(202).json({ message: "Pesan diterima." });
      return;
    }
    const record = await prisma.contactMessage.create({
      data: {
        name: plainText(req.body.name),
        email: String(req.body.email).trim().toLowerCase(),
        subject: String(req.body.subject),
        message: plainText(req.body.message)
      },
      select: { id: true, createdAt: true }
    });
    res.status(201).json({ data: record, message: "Pesan berhasil disimpan. Tim dukungan akan meninjaunya." });
  } catch (error) {
    handleControllerError(res, error);
  }
}

function plainText(value: unknown) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}
