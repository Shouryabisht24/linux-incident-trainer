import type { PointerEvent, SVGProps } from "react";
import { Link } from "react-router-dom";
import { useActiveSession, useChallenges, useProgress } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { DifficultyBadge, ErrorBanner, PageLoading, Reveal } from "../components/ui";
import { useCountUp } from "../hooks/useCountUp";
import { useScrollReveal } from "../hooks/useScrollReveal";

// ---------------------------------------------------------------------------
// Icons — same hand-authored 22x22 stroke-glyph convention as LandingPage/
// ChallengeListPage (no icon package, no emoji).
// ---------------------------------------------------------------------------

function iconProps(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    width: 20,
    height: 20,
    viewBox: "0 0 22 22",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

function TerminalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <rect x="2" y="3.5" width="18" height="15" rx="2" />
      <path d="M6 8.5l3 2.5-3 2.5" />
      <path d="M11.5 13.5h4.5" />
    </svg>
  );
}

function CompassIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="11" cy="11" r="8.5" />
      <path d="M14.2 7.8l-2 4.4-4.4 2 2-4.4z" />
    </svg>
  );
}

function ChartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 18.5h16" />
      <path d="M6 18.5v-5" />
      <path d="M11 18.5v-9" />
      <path d="M16 18.5v-13" />
    </svg>
  );
}

function HelpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="11" cy="11" r="8.5" />
      <circle cx="11" cy="11" r="4.2" />
      <path d="M5.3 5.3l3.2 3.2" />
      <path d="M16.7 5.3l-3.2 3.2" />
      <path d="M5.3 16.7l3.2-3.2" />
      <path d="M16.7 16.7l-3.2-3.2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Moves the spotlight-glow's origin to the pointer position via a plain DOM
// style mutation, not React state — same pattern as LandingPage.tsx's
// `handleSpotlightMove` (duplicated here rather than extracted to a hook, per
// this codebase's existing convention for this bare pure function).
//
// `.dashboard-continue-live`/`.dashboard-progress-card` also get a restrained
// tilt-on-hover (see `styles.css`'s `--tilt-x`/`--tilt-y` consumers on their
// `:hover` rules) — combined into this single handler rather than stacking a
// second `onPointerMove` prop, since React only keeps the last one assigned
// to a given element anyway. Tilt is skipped for non-mouse/pen pointers (the
// touch-equivalent of this file's existing `pointer: fine` CSS gate on the
// spotlight glow itself — touch has no real hover, so there's nothing for a
// stale tilt value to visually engage with, but skipping it in JS avoids ever
// setting one in the first place).
// ---------------------------------------------------------------------------

function handleSpotlightMove(e: PointerEvent<HTMLDivElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
  const px = (e.clientX - rect.left) / rect.width - 0.5;
  const py = (e.clientY - rect.top) / rect.height - 0.5;
  e.currentTarget.style.setProperty("--tilt-x", `${(-py * 16).toFixed(2)}deg`);
  e.currentTarget.style.setProperty("--tilt-y", `${(px * 16).toFixed(2)}deg`);
}

function handleTiltLeave(e: PointerEvent<HTMLDivElement>) {
  e.currentTarget.style.setProperty("--tilt-x", "0deg");
  e.currentTarget.style.setProperty("--tilt-y", "0deg");
}

// ---------------------------------------------------------------------------
// Continue-session card
// ---------------------------------------------------------------------------

function ContinueSessionCard() {
  const activeSessionQuery = useActiveSession();
  const session = activeSessionQuery.data?.session;

  if (activeSessionQuery.isLoading) {
    return (
      <Reveal as="div" className="card dashboard-continue-card">
        <PageLoading label="Checking for an active session…" />
      </Reveal>
    );
  }

  if (!session) {
    return (
      <Reveal as="div" className="card dashboard-continue-card dashboard-continue-empty">
        <span className="kicker-line">$ session --active</span>
        <TerminalIcon className="dashboard-continue-empty-icon" />
        <p style={{ fontWeight: 700, marginBottom: "var(--space-1)" }}>No session running</p>
        <p className="muted" style={{ marginBottom: "var(--space-4)" }}>
          Start a challenge below and it'll show up here — refresh mid-incident and you'll be reconnected right
          where you left off.
        </p>
        <Link to="/challenges" className="btn btn-ghost btn-sm">
          Start a challenge
          <span className="btn-arrow" aria-hidden="true">
            &rarr;
          </span>
        </Link>
      </Reveal>
    );
  }

  return (
    <Reveal
      className="card dashboard-continue-card dashboard-continue-live"
      onPointerMove={handleSpotlightMove}
      onPointerLeave={handleTiltLeave}
    >
      <Link to={`/challenges/${session.challenge_slug}`} className="dashboard-continue-card-link">
        <span className="kicker-line">$ session --active</span>
        <div className="spread">
          <div>
            <div className="dashboard-continue-title">
              <span className={`dot dot-${session.status === "running" ? "connected" : "connecting"}`} />
              {session.challenge_title}
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              {session.hints_used > 0
                ? `In progress — ${session.hints_used} hint${session.hints_used === 1 ? "" : "s"} used so far.`
                : "In progress — no hints used yet."}
            </p>
          </div>
          <span className="btn btn-primary btn-sm dashboard-continue-cta">Resume</span>
        </div>
      </Link>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Progress snapshot — reuses the exact same `useProgress()` query (and cache
// entry) that `/progress` reads, so the numbers here can never drift from the
// detailed page: this is a lighter summary view over identical data, not a
// second computation of "your stats." See decisions/0019-*.md.
// ---------------------------------------------------------------------------

function ProgressSnapshotCard() {
  const [ref, visible] = useScrollReveal<HTMLDivElement>();
  const { data, isLoading, error } = useProgress();
  const count = useCountUp(data?.solved ?? 0, visible);

  if (isLoading) {
    return (
      <div className="card dashboard-progress-card">
        <PageLoading label="Loading progress…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card dashboard-progress-card">
        <ErrorBanner message={error instanceof Error ? error.message : "failed to load progress"} />
      </div>
    );
  }

  const pct = data.total > 0 ? (data.solved / data.total) * 100 : 0;
  const topCategories = [...data.categories]
    .filter((c) => c.total > 0)
    .sort((a, b) => b.solved / b.total - a.solved / a.total)
    .slice(0, 3);

  return (
    <Reveal
      className="card dashboard-progress-card"
      onPointerMove={handleSpotlightMove}
      onPointerLeave={handleTiltLeave}
    >
      <div ref={ref}>
        <span className="kicker-line">$ progress --summary</span>
        <div className="dashboard-progress-count">
          <span className="tabular count-shine">{count}</span>
          <span className="muted"> / {data.total} solved</span>
        </div>
        <div className="progress-bar-track" style={{ marginBottom: "1.25rem" }}>
          <div className="progress-bar-fill" style={{ width: visible ? `${pct}%` : "0%" }} />
        </div>

        {topCategories.length > 0 && (
          <div className="dashboard-progress-categories">
            {topCategories.map((c) => {
              const catPct = c.total > 0 ? (c.solved / c.total) * 100 : 0;
              return (
                <div className="dashboard-progress-cat-row-wrap" key={c.slug}>
                  <div className="dashboard-progress-cat-row">
                    <span className="muted">{c.name}</span>
                    <span className="faint tabular">
                      {c.solved}/{c.total}
                    </span>
                  </div>
                  <div className="progress-bar-track dashboard-progress-cat-bar">
                    <div className="progress-bar-fill" style={{ width: visible ? `${catPct}%` : "0%" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Link to="/progress" className="btn btn-ghost btn-sm dashboard-progress-link">
        View full breakdown
        <span className="btn-arrow" aria-hidden="true">
          &rarr;
        </span>
      </Link>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Recommended challenges — first few unsolved challenges from the same
// `useChallenges()` query the challenge list itself uses.
// ---------------------------------------------------------------------------

function RecommendedSection() {
  const [ref, visible] = useScrollReveal<HTMLDivElement>();
  const { data, isLoading, error } = useChallenges();

  if (isLoading) return <PageLoading label="Loading challenges…" />;
  if (error || !data) return <ErrorBanner message={error instanceof Error ? error.message : "failed to load challenges"} />;

  const unsolved = data.filter((c) => !c.solved);
  const featured = (unsolved.length > 0 ? unsolved : data).slice(0, 3);

  if (data.length === 0) return null;

  return (
    <div>
      <div className="spread dashboard-section-head">
        <h2>{unsolved.length > 0 ? "Pick up next" : "Revisit a solved one"}</h2>
        <Link to="/challenges" className="btn btn-ghost btn-sm">
          Browse all
          <span className="btn-arrow" aria-hidden="true">
            &rarr;
          </span>
        </Link>
      </div>
      <div ref={ref} className="challenge-grid dashboard-recommend-grid">
        {featured.map((c, i) => (
          <Link
            key={c.slug}
            to={`/challenges/${c.slug}`}
            className={`challenge-card${c.solved ? " solved" : ""} reveal${visible ? " is-visible" : ""}`}
            style={{ transitionDelay: visible ? `${Math.min(i, 12) * 35}ms` : "0ms" }}
          >
            <div className="challenge-card-title">{c.title}</div>
            <div className="row row-wrap">
              <DifficultyBadge difficulty={c.difficulty} />
              <span className="badge badge-neutral">{c.categoryName}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function DashboardPage() {
  const { user } = useAuth();
  const name = user?.display_name?.trim() || user?.email.split("@")[0] || "there";

  return (
    <div className="page dashboard-page">
      <Reveal as="div" className="dashboard-header">
        <span className="eyebrow">Dashboard</span>
        <h1 className="gradient-heading">
          Welcome back, {name}
          <span className="dashboard-header-cursor" aria-hidden="true" />
        </h1>
        <p className="muted">Here's where things stand — pick up a session, or start something new.</p>
      </Reveal>

      <div className="dashboard-grid">
        <div className="dashboard-main stack">
          <ContinueSessionCard />
          <RecommendedSection />
        </div>

        <div className="dashboard-side stack">
          <ProgressSnapshotCard />

          <Reveal delayMs={180} className="card dashboard-links-card">
            <span className="kicker-line">$ ls actions/</span>
            <Link to="/challenges" className="dashboard-link-row">
              <CompassIcon className="dashboard-link-icon" />
              <div>
                <div className="dashboard-link-title">Browse challenges</div>
                <div className="faint">Every incident, filterable by category and difficulty.</div>
              </div>
            </Link>
            <Link to="/progress" className="dashboard-link-row">
              <ChartIcon className="dashboard-link-icon" />
              <div>
                <div className="dashboard-link-title">Full progress breakdown</div>
                <div className="faint">Per-category solve counts, all ten categories.</div>
              </div>
            </Link>
            <Link to="/profile" className="dashboard-link-row">
              <TerminalIcon className="dashboard-link-icon" />
              <div>
                <div className="dashboard-link-title">Account settings</div>
                <div className="faint">Update your display name or change your password.</div>
              </div>
            </Link>
            <Link to="/help" className="dashboard-link-row">
              <HelpIcon className="dashboard-link-icon" />
              <div>
                <div className="dashboard-link-title">Get help</div>
                <div className="faint">Ask a question or report a problem — see your past submissions.</div>
              </div>
            </Link>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
