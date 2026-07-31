import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

// pool.query is the only I/O boundary verifyAuthToken crosses (to look up
// password_changed_at) — mock it so this stays a fast, isolated unit test of the actual
// signature/expiry/type/password-change-invalidation logic, not a DB integration test.
vi.mock("../../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

import { pool } from "../../src/db/pool.js";
import {
  hashPassword,
  hashResetToken,
  signAuthToken,
  verifyAuthToken,
  verifyPassword,
} from "../../src/services/auth.service.js";

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

describe("hashPassword / verifyPassword (bcrypt wrappers)", () => {
  it("produces a hash that verifies against the original password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).not.toBe("correct-horse-battery-staple");
    await expect(verifyPassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password against a real hash", async () => {
    const hash = await hashPassword("the-real-password");
    await expect(verifyPassword("a-guess", hash)).resolves.toBe(false);
  });

  it("produces a different hash each time (bcrypt salts), but both still verify", async () => {
    const hashA = await hashPassword("same-password");
    const hashB = await hashPassword("same-password");
    expect(hashA).not.toBe(hashB);
    await expect(verifyPassword("same-password", hashA)).resolves.toBe(true);
    await expect(verifyPassword("same-password", hashB)).resolves.toBe(true);
  });
});

describe("hashResetToken", () => {
  it("is a deterministic sha256 hex digest of the input", () => {
    const token = "some-random-reset-token";
    const expected = crypto.createHash("sha256").update(token).digest("hex");
    expect(hashResetToken(token)).toBe(expected);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashResetToken("token-a")).not.toBe(hashResetToken("token-b"));
  });
});

describe("signAuthToken / verifyAuthToken", () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it("round-trips: a freshly signed token verifies and returns the same userId", async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ password_changed_at: null }] });

    const token = signAuthToken("user-123");
    const result = await verifyAuthToken(token);

    expect(result.userId).toBe("user-123");
  });

  it("rejects a token with a bad signature", async () => {
    const foreignToken = jwt.sign({ sub: "user-123", type: "auth" }, "a-different-secret", {
      expiresIn: "7d",
    });
    await expect(verifyAuthToken(foreignToken)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const expired = jwt.sign({ sub: "user-123", type: "auth" }, process.env.JWT_SECRET!, {
      expiresIn: "-1s",
    });
    await expect(verifyAuthToken(expired)).rejects.toThrow();
  });

  it("rejects a token of the wrong type (e.g. a ws-ticket signed with the same secret)", async () => {
    const wsTicket = jwt.sign({ sub: "user-123", sessionId: "s1", type: "ws-ticket" }, process.env.JWT_SECRET!, {
      expiresIn: "60s",
    });
    await expect(verifyAuthToken(wsTicket)).rejects.toThrow("invalid token type");
  });

  it("rejects a token whose user no longer exists", async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    const token = signAuthToken("deleted-user");
    await expect(verifyAuthToken(token)).rejects.toThrow("user not found");
  });

  it("accepts a token issued after the most recent password change", async () => {
    const changedAt = new Date(Date.now() - 60_000); // changed 1 minute ago
    mockedQuery.mockResolvedValueOnce({ rows: [{ password_changed_at: changedAt.toISOString() }] });

    // Sign a token whose iat is "now" (after changedAt).
    const token = signAuthToken("user-123");
    const result = await verifyAuthToken(token);
    expect(result.userId).toBe("user-123");
  });

  it("rejects a token issued before the most recent password change", async () => {
    // Sign a token with an iat 5 minutes in the past...
    const oldIat = Math.floor(Date.now() / 1000) - 300;
    const staleToken = jwt.sign({ sub: "user-123", type: "auth", iat: oldIat }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });
    // ...and a password change that happened 1 minute ago (after the token's iat).
    const changedAt = new Date(Date.now() - 60_000);
    mockedQuery.mockResolvedValueOnce({ rows: [{ password_changed_at: changedAt.toISOString() }] });

    await expect(verifyAuthToken(staleToken)).rejects.toThrow("token issued before most recent password change");
  });
});
