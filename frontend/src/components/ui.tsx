import type { PointerEvent, ReactNode, RefObject } from "react";
import { useScrollReveal } from "../hooks/useScrollReveal";

export function Spinner() {
  return <span className="spinner" role="status" aria-label="loading" />;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="alert alert-error" role="alert">
      {message}
    </div>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const cls =
    difficulty === "beginner" ? "badge-beginner" : difficulty === "intermediate" ? "badge-intermediate" : "badge-hard";
  return <span className={`badge ${cls}`}>{difficulty}</span>;
}

export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="row" style={{ padding: "3rem 0", justifyContent: "center", color: "var(--color-text-muted)" }}>
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reveal — scroll-triggered fade/rise wrapper, promoted from its original home
// as a local function inside LandingPage.tsx (unchanged behavior — that copy
// is left in place there, this is an identical duplicate for reuse elsewhere).
// ---------------------------------------------------------------------------

export function Reveal({
  children,
  delayMs = 0,
  className = "",
  as = "div",
  onPointerMove,
  onPointerLeave,
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
  as?: "div" | "li" | "details";
  onPointerMove?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerLeave?: (e: PointerEvent<HTMLDivElement>) => void;
}) {
  const [ref, visible] = useScrollReveal<HTMLElement>();
  const Tag = as as "div";
  return (
    <Tag
      ref={ref as unknown as RefObject<HTMLDivElement>}
      className={`reveal${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </Tag>
  );
}
