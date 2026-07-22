import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

/** Animates a number counting up to `target` once `start` flips true (e.g. when a stat tile
 * scrolls into view). Reduced-motion users get the final value immediately — the count-up is a
 * decorative flourish, never the only way to read the number. */
export function useCountUp(target: number, start: boolean, durationMs = 1400): number {
  const reducedMotion = useReducedMotion();
  const [value, setValue] = useState(reducedMotion ? target : 0);
  const frame = useRef<number>();

  useEffect(() => {
    if (!start) return;
    if (reducedMotion || target <= 0) {
      setValue(target);
      return;
    }

    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      setValue(Math.round(easeOutQuint(progress) * target));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [start, target, durationMs, reducedMotion]);

  return value;
}
