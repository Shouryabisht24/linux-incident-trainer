import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Both test/unit and test/integration match this glob; the "test" vs. "test:integration" npm
    // scripts scope which one actually runs by passing the subdirectory as a CLI path filter.
    // "npm test" (test/unit) never touches a real DB or Docker daemon — every module it imports is
    // either pure or has its I/O boundary mocked. "npm run test:integration" (test/integration)
    // needs a real reachable Postgres (DATABASE_URL) — see test/integration/auth.integration.test.ts
    // for exactly how to run it against this repo's docker-compose Postgres.
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
