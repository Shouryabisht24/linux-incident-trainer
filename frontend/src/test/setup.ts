import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// @testing-library/react's automatic post-test unmount only self-registers when it finds a *global*
// `afterEach` (e.g. Vitest's `globals: true` mode, which this project isn't using so imports stay
// explicit everywhere else). Without this, every render() from a previous test stays mounted into
// the same jsdom document, and later `getByText`/`getByLabelText` calls start throwing
// "found multiple elements" once more than one test in a file renders the same markup.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement matchMedia at all — every hook/component that reads
// `prefers-reduced-motion` (useReducedMotion, and everything built on it:
// useCountUp, useScrollReveal) would throw on mount without this. Default to
// "no reduced-motion preference" (matches: false) so tests get the normal,
// animated code path unless a specific test overrides it via
// `vi.spyOn(window, "matchMedia").mockReturnValue(...)` to exercise the
// reduced-motion branch. `writable: true` is what makes that per-test
// spyOn/restore cycle possible.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
