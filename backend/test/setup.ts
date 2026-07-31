// Runs before every test file (see vitest.config.ts's setupFiles), before that file's own imports
// execute. auth.service.ts reads JWT_SECRET at module load time (`process.env.JWT_SECRET!`), so it
// must be set here — not inline in a test file, where it would run too late relative to the
// static `import { ... } from "../src/services/auth.service.js"` at the top of that same file.
process.env.JWT_SECRET ??= "vitest-test-secret-do-not-use-outside-tests";

// Unit tests never open a real DB connection (pool.query is mocked wherever it'd be reached), so
// this is only a safe, inert default in case anything constructs a pg.Pool. Integration tests
// require a real DATABASE_URL to already be set in the environment they run in (see
// test/integration/auth.integration.test.ts) and do not rely on this fallback.
process.env.DATABASE_URL ??= "postgres://invalid-unused-in-unit-tests/void";
