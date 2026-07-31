import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "../../src/middleware/rateLimit.js";

/**
 * Minimal fakes — the middleware under test only ever touches req via `opts.keyFn(req)` (which
 * each test controls directly) and res via `.setHeader`/`.status`/`.json`, so there's no need to
 * pull in a real Express app or supertest for this.
 */
function fakeRes(): Response {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response;
}

function fakeReq(): Request {
  return {} as Request;
}

describe("rateLimit()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to `max` requests within the window", () => {
    const limiter = rateLimit({ name: "test", windowMs: 1000, max: 3, keyFn: () => "same-key" });
    const next = vi.fn();

    for (let i = 0; i < 3; i++) {
      const res = fakeRes();
      limiter(fakeReq(), res, next);
      expect(res.statusCode).toBe(200); // never touched by the 429 branch
    }

    expect(next).toHaveBeenCalledTimes(3);
  });

  it("blocks the max+1th request with 429 and a Retry-After header", () => {
    const limiter = rateLimit({ name: "test", windowMs: 1000, max: 3, keyFn: () => "same-key" });
    const next = vi.fn();

    for (let i = 0; i < 3; i++) limiter(fakeReq(), fakeRes(), next);

    const res = fakeRes();
    limiter(fakeReq(), res, next);

    expect(next).toHaveBeenCalledTimes(3); // the 4th call did not reach next()
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: "Too many attempts. Please wait and try again." });
    expect(res.headers["Retry-After"]).toBeDefined();
    expect(Number(res.headers["Retry-After"])).toBeGreaterThan(0);
  });

  it("keeps blocking further requests within the same window once over the limit", () => {
    const limiter = rateLimit({ name: "test", windowMs: 1000, max: 2, keyFn: () => "same-key" });
    const next = vi.fn();

    limiter(fakeReq(), fakeRes(), next);
    limiter(fakeReq(), fakeRes(), next);
    const blocked1 = fakeRes();
    limiter(fakeReq(), blocked1, next);
    const blocked2 = fakeRes();
    limiter(fakeReq(), blocked2, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(blocked1.statusCode).toBe(429);
    expect(blocked2.statusCode).toBe(429);
  });

  it("resets the bucket once the window has fully elapsed", () => {
    const limiter = rateLimit({ name: "test", windowMs: 1000, max: 1, keyFn: () => "same-key" });
    const next = vi.fn();

    const first = fakeRes();
    limiter(fakeReq(), first, next);
    expect(first.statusCode).toBe(200);

    const secondWithinWindow = fakeRes();
    limiter(fakeReq(), secondWithinWindow, next);
    expect(secondWithinWindow.statusCode).toBe(429);

    // Advance past the window boundary — the fixed window should roll over to a fresh bucket.
    vi.advanceTimersByTime(1001);

    const afterReset = fakeRes();
    limiter(fakeReq(), afterReset, next);
    expect(afterReset.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(2); // first request + the one after reset
  });

  it("tracks different keys (from keyFn) independently", () => {
    const limiter = rateLimit({
      name: "test",
      windowMs: 1000,
      max: 1,
      keyFn: (req) => (req as unknown as { userKey: string }).userKey,
    });
    const next = vi.fn();

    const reqA = { userKey: "user-a" } as unknown as Request;
    const reqB = { userKey: "user-b" } as unknown as Request;

    const aFirst = fakeRes();
    limiter(reqA, aFirst, next);
    expect(aFirst.statusCode).toBe(200);

    // user-a is now at its limit — a second user-a request should be blocked...
    const aSecond = fakeRes();
    limiter(reqA, aSecond, next);
    expect(aSecond.statusCode).toBe(429);

    // ...but user-b, a completely different key, has its own untouched budget.
    const bFirst = fakeRes();
    limiter(reqB, bFirst, next);
    expect(bFirst.statusCode).toBe(200);

    expect(next).toHaveBeenCalledTimes(2); // aFirst + bFirst
  });
});
