import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";
import { MarketingLayout } from "../components/MarketingLayout";
import { useAuth } from "../context/AuthContext";
import { useCountUp } from "../hooks/useCountUp";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { usePublicStats } from "../api/queries";

// ---------------------------------------------------------------------------
// Reveal — scroll-triggered fade/rise wrapper. Purely presentational; the
// visibility bookkeeping lives in useScrollReveal so every section can share
// the exact same animation contract (and the exact same reduced-motion
// escape hatch). Kept as this page's own local copy (an identical copy also
// lives in components/ui.tsx for use elsewhere) — accepted duplication, per
// this codebase's existing convention (decisions/0021-*.md).
// ---------------------------------------------------------------------------

function Reveal({
  children,
  delayMs = 0,
  className = "",
  as = "div",
  onPointerMove,
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
  as?: "div" | "li" | "details";
  onPointerMove?: (e: PointerEvent<HTMLDivElement>) => void;
}) {
  const [ref, visible] = useScrollReveal<HTMLElement>();
  const Tag = as as "div";
  return (
    <Tag
      ref={ref as unknown as RefObject<HTMLDivElement>}
      className={`reveal${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
      onPointerMove={onPointerMove}
    >
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

interface StatDef {
  value: number;
  suffix: string;
  label: string;
}

function StatTile({ stat, start, staggerMs }: { stat: StatDef; start: boolean; staggerMs: number }) {
  // Each tile counts up over a slightly longer duration than the last, so they finish in a gentle
  // cascade rather than all landing on their final value in the same instant.
  const count = useCountUp(stat.value, start, 1200 + staggerMs);
  return (
    <div className="stat-tile">
      <div className="stat-tile-value">
        <span className="tabular">{count}</span>
        {stat.suffix}
      </div>
      <div className="stat-tile-label">{stat.label}</div>
    </div>
  );
}

function StatsSection() {
  // Fall back to the last-known-real counts (27 challenges / 10 categories, as of this build) if
  // the endpoint is briefly unreachable — never blocks the section, never shows a broken "0".
  const { data } = usePublicStats();
  const challengeCount = data?.challengeCount ?? 27;
  const categoryCount = data?.categoryCount ?? 10;
  const [ref, visible] = useScrollReveal<HTMLDivElement>();

  const stats: StatDef[] = [
    { value: challengeCount, suffix: "", label: "hands-on incidents" },
    { value: categoryCount, suffix: "", label: "failure categories" },
    { value: 100, suffix: "%", label: "real containers, zero simulations" },
  ];

  return (
    <section className="stats-section" aria-label="By the numbers">
      <div ref={ref} className={`stats-grid reveal${visible ? " is-visible" : ""}`}>
        {stats.map((s, i) => (
          <StatTile key={s.label} stat={s} start={visible} staggerMs={i * 220} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Moves the spotlight-glow's origin to the pointer position via a plain DOM
// style mutation, not React state — this fires on every `pointermove`, and
// re-rendering the whole card (or the whole grid) at that frequency for a
// purely visual effect would be exactly the "dozens of re-renders"
// vercel-react-best-practices warns against. Duplicated here (rather than a
// shared hook) per this codebase's existing convention for this bare pure
// function, already used this way across FeaturesPage.tsx/DashboardPage.tsx/
// ProgressDashboardPage.tsx.
// ---------------------------------------------------------------------------

function handleSpotlightMove(e: PointerEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

interface TranscriptSegment {
  text: string;
  /** One of the .t-* color classes below, or omitted for plain output text. */
  cls?: string;
}

// The exact terminal session this hero depicts — plain data, not JSX, so it can be flattened into
// a single character stream once (module load, not per-render) for HeroTerminal's reveal below.
const HERO_TRANSCRIPT: TranscriptSegment[] = [
  { text: "trainee@systemd-crashloop:~$ ", cls: "t-prompt" },
  { text: "systemctl status app.service", cls: "t-cmd" },
  { text: "\n" },
  { text: "● app.service - Demo Application", cls: "t-danger" },
  { text: "\n   Active: " },
  { text: "failed (Result: exit-code)", cls: "t-danger" },
  { text: "\n   Process: ExecStart=/usr/bin/demo-app-typo (code=exited, status=203/EXEC)\n\n" },
  { text: "trainee@systemd-crashloop:~$ ", cls: "t-prompt" },
  { text: "sudo sed -i 's/demo-app-typo/demo-app/' /etc/systemd/system/app.service", cls: "t-cmd" },
  { text: "\n" },
  { text: "trainee@systemd-crashloop:~$ ", cls: "t-prompt" },
  { text: "sudo systemctl daemon-reload && sudo systemctl restart app.service", cls: "t-cmd" },
  { text: "\n" },
  { text: "trainee@systemd-crashloop:~$ ", cls: "t-prompt" },
  { text: "systemctl is-active app.service", cls: "t-cmd" },
  { text: "\n" },
  { text: "active", cls: "t-success" },
];

interface TranscriptChar {
  ch: string;
  cls?: string;
}

const HERO_CHARS: TranscriptChar[] = HERO_TRANSCRIPT.flatMap((seg) =>
  Array.from(seg.text, (ch) => ({ ch, cls: seg.cls })),
);

const HERO_REVEAL_MS_PER_CHAR = 6;

// The signature element: the hero terminal plays back its transcript character-by-character on
// scroll-into-view rather than appearing instantly, ending on the real `active` success line, with
// a status strip that transitions danger -> success in sync. Reveal progress is driven by a ref +
// requestAnimationFrame that mutates each character span's class directly — not per-character
// React state, which would mean hundreds of re-renders for a purely visual effect (see
// vercel-react-best-practices' "use useRef for transient values" guidance). The only React state
// update in the whole sequence is the single flip to `revealComplete` once the last character
// lands, which is what the status strip and cursor actually key off.
function HeroTerminal() {
  const reducedMotion = useReducedMotion();
  const [wrapRef, visible] = useScrollReveal<HTMLDivElement>();
  const [revealComplete, setRevealComplete] = useState(reducedMotion);
  const spansRef = useRef<(HTMLSpanElement | null)[]>([]);
  const frameRef = useRef<number>();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!visible || startedRef.current) return;
    startedRef.current = true;

    if (reducedMotion) {
      // Reduced-motion visitors get the finished transcript immediately — no playback at all.
      spansRef.current.forEach((el) => el?.classList.add("is-revealed"));
      setRevealComplete(true);
      return;
    }

    const total = HERO_CHARS.length;
    const startTime = performance.now();
    let revealed = 0;

    function tick(now: number) {
      const target = Math.min(total, Math.floor((now - startTime) / HERO_REVEAL_MS_PER_CHAR));
      for (; revealed < target; revealed++) {
        spansRef.current[revealed]?.classList.add("is-revealed");
      }
      if (revealed >= total) {
        setRevealComplete(true);
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, [visible, reducedMotion]);

  return (
    <div
      ref={wrapRef}
      className={`hero-terminal${revealComplete ? " is-fixed" : ""}`}
      role="img"
      aria-label="Terminal session diagnosing and fixing a failed systemd service"
    >
      <div className="hero-terminal-status-strip" aria-hidden="true" />
      <div className="hero-terminal-bar">
        <span className="hero-terminal-dot" style={{ background: "var(--term-mock-danger)" }} />
        <span className="hero-terminal-dot" style={{ background: "var(--term-mock-warning)" }} />
        <span className="hero-terminal-dot" style={{ background: "var(--term-mock-success)" }} />
        <span className="hero-terminal-title">trainee@systemd-crashloop</span>
      </div>
      <pre className="hero-terminal-body" aria-hidden="true">
        {HERO_CHARS.map((c, i) => (
          <span
            key={i}
            ref={(el) => {
              spansRef.current[i] = el;
            }}
            className={`hero-char${c.cls ? ` ${c.cls}` : ""}`}
          >
            {c.ch}
          </span>
        ))}
        <span className={`hero-terminal-cursor${revealComplete ? " is-active" : ""}`} aria-hidden="true" />
      </pre>
    </div>
  );
}

// Full-bleed gradient-mesh + dot-grid backdrop, plus the wave divider that seams into the stats
// section below. Purely decorative (aria-hidden) — the wave is a single short SVG path, not an
// illustration, so it stays cheap to render and easy to tweak.
function HeroBackground() {
  return (
    <div className="hero-bg" aria-hidden="true">
      <svg className="hero-wave" viewBox="0 0 1440 96" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0,30 C240,78 480,4 720,26 C960,48 1200,86 1440,38 L1440,96 L0,96 Z"
          fill="var(--color-bg-elevated)"
        />
      </svg>
    </div>
  );
}

function Hero() {
  const { user } = useAuth();

  return (
    <section className="hero-section">
      <HeroBackground />
      <div className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Not a quiz. Not a video course.</span>
          <h1 className="gradient-heading">
            Practice production incidents on a Linux box that's actually broken.
          </h1>
          <p className="hero-sub">
            Linux Incident Trainer drops you into a live terminal inside a genuinely broken Docker container —
            misconfigured services, full disks, masked units, bad sudoers — and checks whether you actually fixed
            it.
          </p>
          <div className="hero-cta-row">
            {user ? (
              <Link to="/dashboard" className="btn btn-primary btn-lg">
                Go to dashboard
              </Link>
            ) : (
              <Link to="/login?mode=signup" className="btn btn-primary btn-lg">
                Get started
              </Link>
            )}
            <Link to="/how-it-works" className="btn btn-ghost btn-lg">
              See how it works
              <span className="btn-arrow" aria-hidden="true">
                &rarr;
              </span>
            </Link>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-terminal-frame">
            <HeroTerminal />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// About-nav — a small grid of cards linking out to the four pages Features/
// Walkthrough/SelfHost/Faq were split into (see MarketingLayout.tsx / the
// four new pages under pages/). Replaces those sections' old in-page anchor
// links now that they're separate routes.
// ---------------------------------------------------------------------------

const ABOUT_NAV_ITEMS = [
  { title: "Features", body: "What's actually inside the platform.", to: "/features" },
  { title: "How it works", body: "What solving one incident looks like, step by step.", to: "/how-it-works" },
  { title: "Self-hosting", body: "Run it yourself with one docker compose command.", to: "/self-hosting" },
  { title: "FAQ", body: "Common questions, answered.", to: "/faq" },
];

function AboutNavCards() {
  return (
    <section className="section" aria-labelledby="about-nav-heading">
      <Reveal>
        <div className="section-head">
          <span className="section-kicker">
            <span className="kicker-prompt">~/</span>learn-more
          </span>
          <h2 id="about-nav-heading">Everything else about this app</h2>
        </div>
      </Reveal>
      <div className="marketing-nav-grid">
        {ABOUT_NAV_ITEMS.map((item, i) => (
          <Reveal as="div" key={item.title} delayMs={(i % 4) * 70}>
            <Link to={item.to} className="marketing-nav-card" onPointerMove={handleSpotlightMove}>
              <h3>{item.title}</h3>
              <p className="muted">{item.body}</p>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function FinalCta() {
  const { user } = useAuth();
  return (
    <section className="section final-cta-section" aria-labelledby="final-cta-heading">
      <Reveal className="final-cta">
        <h2 id="final-cta-heading">
          {user ? "Ready to jump back in?" : "Ready to fix something that's actually broken?"}
        </h2>
        <p className="muted">
          {user
            ? "Your dashboard has where you left off, and what's next."
            : "Create an account and your first broken container is one click away."}
        </p>
        <Link to={user ? "/dashboard" : "/login?mode=signup"} className="btn btn-primary btn-lg">
          {user ? "Go to dashboard" : "Get started"}
        </Link>
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------

export function LandingPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Linux Incident Trainer — practice real Linux production incidents";
    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <MarketingLayout>
      <Hero />
      <StatsSection />
      <AboutNavCards />
      <FinalCta />
    </MarketingLayout>
  );
}
