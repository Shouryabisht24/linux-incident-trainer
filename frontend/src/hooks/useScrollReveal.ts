import { useEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "./useReducedMotion";

/** Attaches an IntersectionObserver to the returned ref and flips `true` once the element crosses
 * the viewport threshold — used to trigger scroll-in reveal animations. Fires once (the observer is
 * disconnected after the first reveal) and resolves immediately, with no animation, for
 * reduced-motion users so nothing is ever gated behind a transition they asked to skip. */
export function useScrollReveal<T extends HTMLElement>(threshold = 0.15): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reducedMotion, threshold]);

  return [ref, visible];
}
