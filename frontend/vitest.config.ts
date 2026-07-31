import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Deliberately a standalone config rather than extending vite.config.ts:
// the production config's `build.rollupOptions`/dev `server.proxy` block are
// irrelevant to (and would need stubbing out for) a jsdom test run, so a
// small dedicated config — just the React plugin (for JSX in .tsx test
// files/components) plus the `test` block — is simpler than merging.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
