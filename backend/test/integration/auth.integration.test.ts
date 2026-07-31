// Integration tests: these hit the REAL Postgres this repo's docker-compose stack runs (via the
// `pool` singleton and its DATABASE_URL), unlike test/unit/**, which never opens a real DB
// connection. Postgres has no host-exposed port (docker-compose.yml deliberately keeps it
// internal-network-only), so these can't run from a bare host shell — run them where the real
// DATABASE_URL already resolves, i.e. inside the backend container on the `internal` network:
//
//   docker compose exec backend npm run test:integration
//
// (docker-compose.override.yml bind-mounts backend/test + vitest.config.ts into the container for
// exactly this.) Every row this file creates is deleted in an `afterEach`/`afterAll`, the same
// "clean up after yourself" discipline every prior manual verification pass on this project has
// used against this same running Postgres container.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { pool } from "../../src/db/pool.js";
import { changePassword, getUserById, hashResetToken, login, resetPasswordWithToken, signup, verifyAuthToken } from "../../src/services/auth.service.js";

const createdUserIds: string[] = [];

function throwawayEmail(): string {
  return `vitest-${randomUUID()}@example.invalid`;
}

afterEach(async () => {
  if (createdUserIds.length === 0) return;
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [createdUserIds]);
  createdUserIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("signup / login (real DB)", () => {
  it("signs up, then logs in with the same credentials", async () => {
    const email = throwawayEmail();
    const { user, token } = await signup(email, "correct-horse-battery", "Vitest Throwaway");
    createdUserIds.push(user.id);

    expect(user.email).toBe(email);
    const { userId } = await verifyAuthToken(token);
    expect(userId).toBe(user.id);

    const loginResult = await login(email, "correct-horse-battery");
    expect(loginResult.user.id).toBe(user.id);
  });

  it("rejects login with the wrong password", async () => {
    const email = throwawayEmail();
    const { user } = await signup(email, "correct-horse-battery", undefined);
    createdUserIds.push(user.id);

    await expect(login(email, "wrong-password")).rejects.toThrow("invalid email or password");
  });

  it("rejects signup with an already-registered email", async () => {
    const email = throwawayEmail();
    const { user } = await signup(email, "correct-horse-battery", undefined);
    createdUserIds.push(user.id);

    await expect(signup(email, "some-other-password", undefined)).rejects.toThrow("email already registered");
  });
});

describe("changePassword invalidates already-issued tokens (real DB)", () => {
  it("rejects a token issued before the change, accepts one issued after", async () => {
    const email = throwawayEmail();
    const { user, token: oldToken } = await signup(email, "original-password-1", undefined);
    createdUserIds.push(user.id);

    // The old token is still valid immediately after signup (password_changed_at is NULL).
    await expect(verifyAuthToken(oldToken)).resolves.toEqual({ userId: user.id });

    // jwt `iat` has 1-second resolution — wait past the second boundary so the password-change
    // timestamp is unambiguously later than the old token's `iat`, not a same-second tie.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await changePassword(user.id, "original-password-1", "new-password-2");

    // The pre-change token must now be rejected...
    await expect(verifyAuthToken(oldToken)).rejects.toThrow("token issued before most recent password change");

    // ...while logging in again (issuing a fresh token) works fine.
    const { token: newToken } = await login(email, "new-password-2");
    await expect(verifyAuthToken(newToken)).resolves.toEqual({ userId: user.id });
  });
});

describe("resetPasswordWithToken invalidates already-issued tokens (real DB)", () => {
  it("rejects a pre-reset token after a password reset via the token flow", async () => {
    const email = throwawayEmail();
    const { user, token: oldToken } = await signup(email, "original-password-1", undefined);
    createdUserIds.push(user.id);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Mint and insert a reset-token row ourselves, exactly the shape requestPasswordReset would
    // produce (hash stored, plaintext never persisted — see auth.service.ts), so this test can
    // exercise resetPasswordWithToken directly without depending on SMTP being configured.
    const plaintextToken = randomUUID() + randomUUID();
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
      [user.id, hashResetToken(plaintextToken)],
    );

    await resetPasswordWithToken(plaintextToken, "reset-password-3");

    await expect(verifyAuthToken(oldToken)).rejects.toThrow("token issued before most recent password change");

    const { token: newToken } = await login(email, "reset-password-3");
    await expect(verifyAuthToken(newToken)).resolves.toEqual({ userId: user.id });
  });
});

describe("getUserById (real DB)", () => {
  it("returns null for a non-existent user", async () => {
    await expect(getUserById(randomUUID())).resolves.toBeNull();
  });
});
