import type { CSSProperties, PointerEvent } from "react";
import { useProgress } from "../api/queries";
import { ErrorBanner, PageLoading, Reveal } from "../components/ui";
import { useCountUp } from "../hooks/useCountUp";
import { useScrollReveal } from "../hooks/useScrollReveal";
import type { ProgressCategory } from "../api/client";

// ---------------------------------------------------------------------------
// Moves the spotlight-glow's origin to the pointer position via a plain DOM
// style mutation, not React state — same pattern as LandingPage.tsx's
// `handleSpotlightMove` (duplicated here rather than extracted to a hook, per
// this codebase's existing convention for this bare pure function).
// ---------------------------------------------------------------------------

function handleSpotlightMove(e: PointerEvent<HTMLDivElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
}

// ---------------------------------------------------------------------------
// ProgressRing — a small donut-style ring built with the `--ring-pct`
// `@property`-animated conic-gradient technique (see styles.css, a direct
// extension of the hero's `--border-angle` moving-border ring). aria-hidden
// since the adjacent tabular number already conveys the real value.
// ---------------------------------------------------------------------------

function ProgressRing({ pct, size, visible }: { pct: number; size: "sm" | "lg"; visible: boolean }) {
  return (
    <span
      className={`progress-ring progress-ring--${size}`}
      style={{ "--ring-pct": visible ? `${pct}%` : "0%" } as CSSProperties}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// CategoryTile — one small-multiple per category. Plain, static, non-
// interactive (no link, no hover-lift) per this page's category-tile rule:
// ChallengeListPage's category filter is local useState, not a URL param, so
// a link like /challenges?category=slug would silently do nothing.
// ---------------------------------------------------------------------------

type CategoryStatus = "none" | "not-started" | "in-progress" | "complete";

function categoryStatus(cat: ProgressCategory): CategoryStatus {
  if (cat.total === 0) return "none";
  if (cat.solved === 0) return "not-started";
  if (cat.solved === cat.total) return "complete";
  return "in-progress";
}

const STATUS_LABEL: Record<CategoryStatus, string> = {
  none: "Not seeded",
  "not-started": "Not started",
  "in-progress": "In progress",
  complete: "Complete",
};

const STATUS_BADGE_CLASS: Record<CategoryStatus, string> = {
  none: "badge-neutral",
  "not-started": "badge-neutral",
  "in-progress": "badge-status-progress",
  complete: "badge-status-complete",
};

function CategoryTile({ cat, delayMs }: { cat: ProgressCategory; delayMs: number }) {
  const [ref, visible] = useScrollReveal<HTMLDivElement>();
  const pct = cat.total > 0 ? (cat.solved / cat.total) * 100 : 0;
  const status = categoryStatus(cat);

  return (
    <div
      ref={ref}
      className={`category-tile reveal${visible ? " is-visible" : ""}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      <div className="category-tile-head">
        <span className="category-tile-name">{cat.name}</span>
        <span className={`badge ${STATUS_BADGE_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="category-tile-body">
        {cat.total > 0 ? (
          <>
            <ProgressRing pct={pct} size="sm" visible={visible} />
            <span className="category-tile-count tabular">
              {cat.solved}/{cat.total}
            </span>
          </>
        ) : (
          <p className="muted category-tile-empty-copy">No challenges seeded in this category yet.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ProgressDashboardPage() {
  const { data, isLoading, error } = useProgress();
  const [summaryRef, summaryVisible] = useScrollReveal<HTMLDivElement>();
  const solvedCount = useCountUp(data?.solved ?? 0, summaryVisible);

  const overallPct = data && data.total > 0 ? (data.solved / data.total) * 100 : 0;
  const categoriesComplete = data ? data.categories.filter((c) => c.total > 0 && c.solved === c.total).length : 0;

  return (
    <div className="page progress-page">
      <Reveal as="div" className="progress-page-header">
        <span className="eyebrow">Progress</span>
        <h1>Your solve record</h1>
        <span className="kicker-line">$ progress --by-category</span>
      </Reveal>

      {isLoading && <PageLoading label="Loading progress…" />}
      {error && <ErrorBanner message={error instanceof Error ? error.message : "failed to load progress"} />}

      {data && (
        <>
          <Reveal className="card progress-summary-card" onPointerMove={handleSpotlightMove}>
            <div ref={summaryRef} className="progress-summary-stats">
              <div className="progress-summary-primary">
                <ProgressRing pct={overallPct} size="lg" visible={summaryVisible} />
                <div>
                  <div className="dashboard-progress-count">
                    <span className="tabular">{solvedCount}</span>
                    <span className="muted"> / {data.total} solved</span>
                  </div>
                  <span className="faint">Across every category</span>
                </div>
              </div>
              <div className="progress-summary-secondary">
                <span className="tabular" style={{ fontSize: "1.4rem", fontWeight: 700 }}>
                  {categoriesComplete}/{data.categories.length}
                </span>
                <span className="faint">categories complete</span>
              </div>
            </div>
          </Reveal>

          <h2 className="progress-grid-heading">By category</h2>
          <div className="progress-category-grid">
            {data.categories.map((cat, i) => (
              <CategoryTile key={cat.slug} cat={cat} delayMs={Math.min(i, 12) * 40} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
