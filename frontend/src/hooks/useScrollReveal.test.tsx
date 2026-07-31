import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollReveal } from "./useScrollReveal";

// jsdom has no IntersectionObserver implementation at all. The well-known mock pattern: stand in a
// class that records the callback passed to its constructor (plus how many instances get created,
// so the reduced-motion test can assert the observer is never even instantiated) and expose a way
// to invoke that callback manually to simulate the element scrolling into view.
let capturedCallback: IntersectionObserverCallback | null = null;
let observerInstanceCount = 0;
let disconnectCallCount = 0;

class MockIntersectionObserver implements IntersectionObserver {
  root: Element | Document | null = null;
  rootMargin = "";
  thresholds: number[] = [];
  constructor(callback: IntersectionObserverCallback) {
    capturedCallback = callback;
    observerInstanceCount += 1;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = () => {
    disconnectCallCount += 1;
  };
  takeRecords = vi.fn(() => []);
}

beforeEach(() => {
  capturedCallback = null;
  observerInstanceCount = 0;
  disconnectCallCount = 0;
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Probe() {
  const [ref, visible] = useScrollReveal<HTMLDivElement>();
  return <div ref={ref}>{visible ? "visible" : "hidden"}</div>;
}

describe("useScrollReveal", () => {
  it("starts false, then flips to true once the observer reports intersection", () => {
    render(<Probe />);
    expect(screen.getByText("hidden")).toBeInTheDocument();
    expect(observerInstanceCount).toBe(1);
    expect(capturedCallback).not.toBeNull();

    act(() => {
      // The hook's callback only destructures the first element (`([entry]) => ...`) and never
      // touches the second `observer` argument, so a dummy stand-in is fine here.
      capturedCallback!([{ isIntersecting: true } as IntersectionObserverEntry], null as unknown as IntersectionObserver);
    });

    expect(screen.getByText("visible")).toBeInTheDocument();
    // Fires once — the hook disconnects its own observer after the first reveal.
    expect(disconnectCallCount).toBe(1);
  });

  it("does not flip to true on a non-intersecting callback invocation", () => {
    render(<Probe />);
    act(() => {
      capturedCallback!([{ isIntersecting: false } as IntersectionObserverEntry], null as unknown as IntersectionObserver);
    });
    expect(screen.getByText("hidden")).toBeInTheDocument();
    expect(disconnectCallCount).toBe(0);
  });

  it("resolves to true immediately for reduced-motion users, without ever creating an observer", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList);

    render(<Probe />);

    expect(screen.getByText("visible")).toBeInTheDocument();
    expect(observerInstanceCount).toBe(0);
  });
});
