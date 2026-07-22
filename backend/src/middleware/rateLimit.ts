import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Derives the bucket key from the request (e.g. IP, or IP+email). */
  keyFn: (req: Request) => string;
  name: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Tiny in-memory fixed-window rate limiter. Deliberately not distributed — this
 * is a single-node personal tool (see hardening scope in tasks.md). Protects the
 * auth endpoints from credential-stuffing / brute force. Buckets are pruned
 * lazily and on a slow interval so the map can't grow unbounded.
 */
export function rateLimit(opts: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, opts.windowMs);
  sweeper.unref?.();

  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const key = opts.keyFn(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      logger.warn("rate limit exceeded", { limiter: opts.name, key, retryAfter });
      res.status(429).json({ error: "Too many attempts. Please wait and try again." });
      return;
    }
    next();
  };
}

/** Best-effort client IP, honoring X-Forwarded-For when express `trust proxy` is set. */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}
