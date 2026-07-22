import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

export function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : "internal error";
  const statusCode = (err as { statusCode?: number })?.statusCode ?? 400;
  logger.error("request error", { err, statusCode });
  res.status(statusCode).json({ error: message });
}
