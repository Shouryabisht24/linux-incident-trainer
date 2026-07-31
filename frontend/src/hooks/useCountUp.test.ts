import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountUp } from "./useCountUp";

// The hook drives its animation with requestAnimationFrame + performance.now() rather than a plain
// interval, so it needs to be fully controlled here: real frames would make the intermediate
// (eased, not-yet-complete) assertion timing-dependent and flaky. Capturing the scheduled callback
// ourselves and invoking it with a hand-picked timestamp lets the "halfway through the duration"
// assertion be exact and deterministic.
let rafCallbacks: FrameRequestCallback[];

beforeEach(() => {
  rafCallbacks = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function runNextFrame(timestamp: number) {
  const cb = rafCallbacks.shift();
  if (!cb) throw new Error("expected a pending requestAnimationFrame callback");
  act(() => cb(timestamp));
}

describe("useCountUp", () => {
  it("eases from 0 up to target once `start` flips true, reaching exactly target at the end", () => {
    vi.spyOn(performance, "now").mockReturnValue(0); // fixes the animation's startTime at t=0
    const { result, rerender } = renderHook(({ start }) => useCountUp(100, start, 1000), {
      initialProps: { start: false },
    });

    expect(result.current).toBe(0);
    expect(rafCallbacks).toHaveLength(0); // no animation scheduled while start is false

    rerender({ start: true });
    expect(rafCallbacks).toHaveLength(1);

    // Halfway through the 1000ms duration: easeOutQuint(0.5) = 1 - 0.5^5 = 0.96875, so the value is
    // already most of the way there — this is what actually distinguishes it from a linear count.
    runNextFrame(500);
    expect(result.current).toBe(Math.round((1 - Math.pow(0.5, 5)) * 100));
    expect(result.current).toBeGreaterThan(50); // eased, not linear
    expect(result.current).toBeLessThan(100);
    expect(rafCallbacks).toHaveLength(1); // progress < 1, so another frame was scheduled

    // Full duration elapsed: lands exactly on target and stops scheduling further frames.
    runNextFrame(1000);
    expect(result.current).toBe(100);
    expect(rafCallbacks).toHaveLength(0);
  });

  it("does NOT jump straight to target just because `start` is already true on mount (without reduced motion, it still animates from 0)", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    const { result } = renderHook(() => useCountUp(40, true, 1000));

    // Initial state is seeded from `reducedMotion ? target : 0` at mount, before the effect (and
    // thus the "start" check) ever runs — so a true `start` on mount is indistinguishable, at the
    // very first render, from a false one. Confirms this hook has no "instant if already started"
    // shortcut: the only paths to an immediate target are reduced-motion or a non-positive target.
    expect(result.current).toBe(0);
    expect(rafCallbacks).toHaveLength(1);

    runNextFrame(1000);
    expect(result.current).toBe(40);
  });

  it("respects reduced motion: returns target immediately and never schedules an animation frame", () => {
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

    const { result } = renderHook(() => useCountUp(50, true, 1000));

    expect(result.current).toBe(50);
    expect(rafCallbacks).toHaveLength(0);
  });
});
