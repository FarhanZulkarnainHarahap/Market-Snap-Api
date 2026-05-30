import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

type RequestPart = "body" | "query" | "params";

export function validate(schema: ZodType, part: RequestPart = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      res.status(400).json({
        message: "Validasi gagal",
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
      return;
    }
    req[part] = result.data;
    next();
  };
}
